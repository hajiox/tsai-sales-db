#!/usr/bin/env python3
"""Validate and import one carrier/month without logging shipment row data."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse
from pathlib import Path

from validate_carrier_csv import (
    emit_report,
    matching_files,
    resolve_period,
    validate_directory,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate monthly carrier CSVs and call the local analytics importer."
    )
    parser.add_argument("--carrier", choices=("yamato", "sagawa"), required=True)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--year", type=int)
    parser.add_argument("--month", type=int, choices=range(1, 13))
    parser.add_argument("--date-column", type=int)
    parser.add_argument(
        "--endpoint",
        default="http://127.0.0.1:3003/api/import",
        help="Local yamato-analytics import endpoint.",
    )
    return parser


def post_import(endpoint: str, payload: dict) -> tuple[int, dict]:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = response.read()
            return response.status, json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, {}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return 0, {}


def endpoint_is_approved(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    return (
        parsed.scheme == "http"
        and parsed.hostname
        in {"127.0.0.1", "localhost", "::1", "192.168.110.200"}
        and parsed.port == 3003
        and parsed.path.rstrip("/") == "/api/import"
        and not parsed.username
        and not parsed.password
        and not parsed.query
        and not parsed.fragment
    )


def main() -> int:
    args = build_parser().parse_args()
    if not endpoint_is_approved(args.endpoint):
        print("IMPORT_FAIL endpoint_not_approved", file=sys.stderr)
        return 2
    try:
        year, month = resolve_period(args.year, args.month)
    except ValueError as exc:
        print(f"IMPORT_FAIL {exc}", file=sys.stderr)
        return 2

    report = validate_directory(
        args.carrier,
        args.directory,
        year,
        month,
        args.date_column,
    )
    emit_report(report)
    if not report.ok:
        print("IMPORT_SKIPPED validation_failed")
        return 2

    selected = [path for _, path in matching_files(args.directory, year, month)]
    status, payload = post_import(
        args.endpoint,
        {
            "carrier": args.carrier,
            "overwrite": False,
            "period": f"{year:04d}-{month:02d}",
        },
    )

    summary = payload.get("summary", {}) if isinstance(payload, dict) else {}
    results = payload.get("results", []) if isinstance(payload, dict) else []
    file_errors = sum(
        len(item.get("errors", []))
        for item in results
        if isinstance(item, dict) and isinstance(item.get("errors", []), list)
    )
    processed = int(summary.get("filesProcessed", 0) or 0)
    inserted = int(summary.get("totalInserted", 0) or 0)
    skipped = int(summary.get("totalSkipped", 0) or 0)
    updated = int(summary.get("totalUpdated", 0) or 0)
    handled = inserted + skipped + updated

    if (
        status < 200
        or status >= 300
        or processed != len(selected)
        or handled != report.importable_rows
        or file_errors
    ):
        print(
            f"IMPORT_FAIL http_status={status} files_expected={len(selected)} "
            f"files_processed={processed} rows_expected={report.importable_rows} "
            f"rows_handled={handled} file_errors={file_errors}"
        )
        return 3

    print(
        f"IMPORT_OK carrier={args.carrier} period={year:04d}-{month:02d} "
        f"files={processed} inserted={inserted} skipped={skipped} updated={updated}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
