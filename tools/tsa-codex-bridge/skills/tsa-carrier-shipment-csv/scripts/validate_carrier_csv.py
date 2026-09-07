#!/usr/bin/env python3
"""Validate monthly Yamato/Sagawa shipment CSVs without emitting row data."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Sequence


NAME_RE = re.compile(
    r"^【抽出前】(?P<year>\d{4})年(?P<month>\d{1,2})月(?P<label>[A-Z]+)\.csv$"
)
SCIENTIFIC_RE = re.compile(r"^[+-]?\d+(?:\.\d+)?[Ee][+-]?\d+$")
DATE_FORMATS = ("%Y/%m/%d", "%Y-%m-%d", "%Y%m%d")
SAGAWA_DATE_HEADERS = (
    "出荷日",
    "発送日",
    "集荷日",
    "出荷予定日",
    "荷受日",
    "受付日",
)


@dataclass(frozen=True)
class FileSummary:
    file: str
    rows: int
    columns: list[int]
    encoding: str
    first_date: str | None
    last_date: str | None
    sha256: str
    excluded_rows: int


@dataclass
class ValidationReport:
    ok: bool
    carrier: str
    period: str
    files: list[FileSummary]
    total_rows: int
    importable_rows: int
    excluded_rows: int
    duplicate_rows: int
    errors: list[str]
    warnings: list[str]


def previous_month(today: date | None = None) -> tuple[int, int]:
    current = today or date.today()
    if current.month == 1:
        return current.year - 1, 12
    return current.year, current.month - 1


def label_to_index(label: str) -> int:
    value = 0
    for char in label:
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value - 1


def index_to_label(index: int) -> str:
    value = index + 1
    label = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        label = chr(ord("A") + remainder) + label
    return label


def decode_csv(raw: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "cp932"):
        try:
            return raw.decode(encoding, errors="strict"), encoding
        except UnicodeDecodeError:
            continue
    raise ValueError("encoding is neither strict UTF-8 nor CP932")


def parse_date(value: str) -> date | None:
    candidate = value.strip()
    for format_string in DATE_FORMATS:
        try:
            return datetime.strptime(candidate, format_string).date()
        except ValueError:
            continue
    match = re.match(r"^(\d{4})/(\d{1,2})/(\d{1,2})(?:\s|$)", candidate)
    if match:
        try:
            return date(*(int(part) for part in match.groups()))
        except ValueError:
            return None
    return None


def normalized_header(value: str) -> str:
    return re.sub(r"[\s　_\-]", "", value).lower()


def detect_sagawa_layout(
    rows: Sequence[Sequence[str]], explicit_date_column: int | None
) -> tuple[bool, int | None]:
    if not rows:
        return False, explicit_date_column
    header = [normalized_header(value) for value in rows[0]]
    normalized_names = [normalized_header(value) for value in SAGAWA_DATE_HEADERS]
    header_present = any(
        any(name == value or name in value for name in normalized_names)
        for value in header
    )
    if explicit_date_column is not None:
        return header_present, explicit_date_column

    for index, value in enumerate(header):
        if any(name == value or name in value for name in normalized_names):
            return True, index

    width = max(len(row) for row in rows)
    best_index: int | None = None
    best_score = 0
    sample = rows[: min(len(rows), 200)]
    for index in range(width):
        score = sum(
            1
            for row in sample
            if index < len(row) and parse_date(row[index]) is not None
        )
        if score > best_score:
            best_index = index
            best_score = score
    minimum = max(1, int(len(sample) * 0.8))
    return False, best_index if best_score >= minimum else None


def row_digest(row: Sequence[str]) -> bytes:
    payload = "\x1f".join(row).encode("utf-8", errors="strict")
    return hashlib.sha256(payload).digest()


def matching_files(directory: Path, year: int, month: int) -> list[tuple[int, Path]]:
    matches: list[tuple[int, Path]] = []
    for path in directory.iterdir():
        if not path.is_file():
            continue
        match = NAME_RE.match(path.name)
        if not match:
            continue
        if int(match.group("year")) != year or int(match.group("month")) != month:
            continue
        matches.append((label_to_index(match.group("label")), path))
    return sorted(matches, key=lambda item: item[0])


def validate_directory(
    carrier: str,
    directory: Path,
    year: int,
    month: int,
    date_column: int | None = None,
) -> ValidationReport:
    errors: list[str] = []
    warnings: list[str] = []
    summaries: list[FileSummary] = []
    seen_rows: set[bytes] = set()
    duplicate_rows = 0
    total_rows = 0
    excluded_rows = 0
    limit = 1000 if carrier == "yamato" else 2000

    if not directory.is_dir():
        return ValidationReport(
            False,
            carrier,
            f"{year:04d}-{month:02d}",
            [],
            0,
            0,
            0,
            0,
            ["archive directory does not exist or is not a directory"],
            [],
        )

    files = matching_files(directory, year, month)
    if not files:
        return ValidationReport(
            False,
            carrier,
            f"{year:04d}-{month:02d}",
            [],
            0,
            0,
            0,
            0,
            ["no files match the required monthly naming pattern"],
            [],
        )

    actual_labels = [index for index, _ in files]
    expected_labels = list(range(len(files)))
    if actual_labels != expected_labels:
        expected = ",".join(index_to_label(index) for index in expected_labels)
        actual = ",".join(index_to_label(index) for index in actual_labels)
        errors.append(f"chunk labels are not contiguous from A (expected {expected}; got {actual})")

    for _, path in files:
        try:
            raw = path.read_bytes()
            text, encoding = decode_csv(raw)
            parsed_rows = [
                row
                for row in csv.reader(io.StringIO(text, newline=""))
                if any(cell.strip() for cell in row)
            ]
        except (OSError, csv.Error, ValueError) as exc:
            errors.append(f"{path.name}: unreadable CSV ({type(exc).__name__})")
            continue

        has_header = False
        detected_date_column: int | None
        if carrier == "yamato":
            detected_date_column = 4 if date_column is None else date_column
        else:
            has_header, detected_date_column = detect_sagawa_layout(
                parsed_rows, date_column
            )

        data_rows = parsed_rows[1:] if has_header else parsed_rows
        total_rows += len(data_rows)
        file_excluded_rows = 0
        if carrier == "sagawa" and has_header:
            normalized = [normalized_header(value) for value in parsed_rows[0]]
            deleted_header = normalized_header("削除区分")
            deleted_index = next(
                (index for index, value in enumerate(normalized) if value == deleted_header),
                None,
            )
            if deleted_index is not None:
                file_excluded_rows = sum(
                    deleted_index < len(row) and row[deleted_index].strip() == "2"
                    for row in data_rows
                )
                excluded_rows += file_excluded_rows
        if not data_rows:
            errors.append(f"{path.name}: no data rows")
            continue
        if len(data_rows) > limit:
            errors.append(
                f"{path.name}: {len(data_rows)} rows exceeds the {carrier} limit of {limit}"
            )

        field_counts = sorted({len(row) for row in data_rows})
        if carrier == "yamato" and any(count not in (93, 97) for count in field_counts):
            errors.append(f"{path.name}: unexpected Yamato field count(s) {field_counts}")
        if len(field_counts) != 1:
            errors.append(f"{path.name}: inconsistent field counts {field_counts}")

        if detected_date_column is None:
            errors.append(f"{path.name}: shipment-date column could not be detected")
            dates: list[date] = []
        else:
            dates = []
            missing_dates = 0
            wrong_period_dates = 0
            for row in data_rows:
                parsed = (
                    parse_date(row[detected_date_column])
                    if detected_date_column < len(row)
                    else None
                )
                if parsed is None:
                    missing_dates += 1
                    continue
                dates.append(parsed)
                if parsed.year != year or parsed.month != month:
                    wrong_period_dates += 1
            if missing_dates:
                errors.append(f"{path.name}: {missing_dates} row(s) have no valid shipment date")
            if wrong_period_dates:
                errors.append(
                    f"{path.name}: {wrong_period_dates} row(s) fall outside the target month"
                )

        scientific_cells = sum(
            1
            for row in data_rows
            for cell in row
            if SCIENTIFIC_RE.match(cell.strip())
        )
        if scientific_cells:
            errors.append(
                f"{path.name}: {scientific_cells} scientific-notation cell(s) detected"
            )

        for row in data_rows:
            digest = row_digest(row)
            if digest in seen_rows:
                duplicate_rows += 1
            else:
                seen_rows.add(digest)

        summaries.append(
            FileSummary(
                file=path.name,
                rows=len(data_rows),
                columns=field_counts,
                encoding=encoding,
                first_date=min(dates).isoformat() if dates else None,
                last_date=max(dates).isoformat() if dates else None,
                sha256=hashlib.sha256(raw).hexdigest(),
                excluded_rows=file_excluded_rows,
            )
        )

    if duplicate_rows:
        errors.append(f"{duplicate_rows} exact duplicate row(s) found across monthly chunks")

    if carrier == "sagawa" and any(summary.rows == 2000 for summary in summaries):
        errors.append(
            "a Sagawa chunk is exactly at the 2000 display ceiling; split and re-export to prove completeness"
        )

    return ValidationReport(
        ok=not errors,
        carrier=carrier,
        period=f"{year:04d}-{month:02d}",
        files=summaries,
        total_rows=total_rows,
        importable_rows=total_rows - excluded_rows,
        excluded_rows=excluded_rows,
        duplicate_rows=duplicate_rows,
        errors=errors[:50],
        warnings=warnings[:50],
    )


def report_dict(report: ValidationReport) -> dict:
    data = asdict(report)
    data["status"] = "PASS" if report.ok else "FAIL"
    return data


def emit_report(report: ValidationReport, as_json: bool = False) -> None:
    if as_json:
        print(json.dumps(report_dict(report), ensure_ascii=False, indent=2))
        return
    status = "PASS" if report.ok else "FAIL"
    print(
        f"{status} carrier={report.carrier} period={report.period} "
        f"files={len(report.files)} rows={report.total_rows} "
        f"importable={report.importable_rows} excluded={report.excluded_rows} "
        f"duplicates={report.duplicate_rows}"
    )
    for item in report.files:
        date_range = f"{item.first_date or '-'}..{item.last_date or '-'}"
        print(
            f"FILE name={item.file} rows={item.rows} excluded={item.excluded_rows} columns={item.columns} "
            f"encoding={item.encoding} dates={date_range} sha256={item.sha256}"
        )
    for message in report.warnings:
        print(f"WARNING {message}")
    for message in report.errors:
        print(f"ERROR {message}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate carrier shipment CSVs without printing customer data."
    )
    parser.add_argument("--carrier", choices=("yamato", "sagawa"), required=True)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--year", type=int)
    parser.add_argument("--month", type=int, choices=range(1, 13))
    parser.add_argument(
        "--date-column",
        type=int,
        help="Zero-based shipment-date column override for a changed carrier format.",
    )
    parser.add_argument("--json", action="store_true")
    return parser


def resolve_period(year: int | None, month: int | None) -> tuple[int, int]:
    if (year is None) != (month is None):
        raise ValueError("--year and --month must be supplied together")
    return (year, month) if year is not None and month is not None else previous_month()


def main(argv: Iterable[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        year, month = resolve_period(args.year, args.month)
    except ValueError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 2
    report = validate_directory(
        args.carrier,
        args.directory,
        year,
        month,
        args.date_column,
    )
    emit_report(report, args.json)
    return 0 if report.ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
