import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

// --- DB ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type RowAgg = {
  channel_code: string | null;
  ytd_amount: string | number | null;
  curr_amount: string | number | null;
  prev_amount: string | number | null;
};

const toNum = (v: string | number | null | undefined) =>
  typeof v === "string" ? Number(v) : (v ?? 0);

// FY=8月開始
function rangesUTC() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  const curr = new Date(Date.UTC(y, m, 1));
  const next = new Date(Date.UTC(y, m + 1, 1));
  const prev = new Date(Date.UTC(y, m - 1, 1));
  const fyStartYear = (m + 1) >= 8 ? y : y - 1;
  const fyStart = new Date(Date.UTC(fyStartYear, 7, 1)); // 8月

  return {
    fyStartISO: fyStart.toISOString().slice(0, 10),
    currISO: curr.toISOString().slice(0, 10),
    prevISO: prev.toISOString().slice(0, 10),
    nextISO: next.toISOString().slice(0, 10),
    fyLabel: `FY${fyStartYear + 1 - 2000}`, // FY26 など
    currLabel: curr.toISOString().slice(0, 7),
    prevLabel: prev.toISOString().slice(0, 7),
    fileSuffix: `${fyStartYear + 1}-${String(m + 1).padStart(2, "0")}`, // 例: 2025-09
  };
}

// 並び順（任意編集可）
const CHANNEL_ORDER = ["WEB", "WHOLESALE", "STORE", "SHOKU"];
const channelRank = (c: string) => {
  const i = CHANNEL_ORDER.indexOf(c);
  return i === -1 ? 999 : i;
};

async function fetchAgg(): Promise<{ rows: RowAgg[]; meta: ReturnType<typeof rangesUTC> }> {
  const r = rangesUTC();
  const sql = `
    SELECT
      channel_code,
      SUM(amount) FILTER (WHERE month >= $1 AND month < $4) AS ytd_amount,
      SUM(amount) FILTER (WHERE month >= $2 AND month < $4) AS curr_amount,
      SUM(amount) FILTER (WHERE month >= $3 AND month < $2) AS prev_amount
    FROM kpi.kpi_sales_monthly_unified_v1
    WHERE COALESCE(amount, 0) <> 0
    GROUP BY channel_code
  `;
  const { rows } = await pool.query<RowAgg>(sql, [
    r.fyStartISO, // $1 YTD 開始
    r.currISO,    // $2 今月 月初
    r.prevISO,    // $3 前月 月初
    r.nextISO,    // $4 来月 月初（未来月除外）
  ]);
  return { rows, meta: r };
}

function csvEscape(s: string) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  try {
    const { rows, meta } = await fetchAgg();

    // 並び替え
    const channels = rows
      .slice()
      .sort((a, b) => {
        const ac = String(a.channel_code ?? "");
        const bc = String(b.channel_code ?? "");
        const r = channelRank(ac) - channelRank(bc);
        return r !== 0 ? r : ac.localeCompare(bc);
      });

    // 合計算出
    const total = channels.reduce(
      (acc, r) => {
        acc.ytd += toNum(r.ytd_amount);
        acc.curr += toNum(r.curr_amount);
        acc.prev += toNum(r.prev_amount);
        return acc;
      },
      { ytd: 0, curr: 0, prev: 0 }
    );

    // CSV 組み立て
    const header = [
      "channel_code",
      `prev (${meta.prevLabel})`,
      `curr (${meta.currLabel})`,
      "diff (MoM)",
      "diff_pct",
      `YTD (${meta.fyLabel})`,
    ].join(",");

    const lines = [header];

    for (const r of channels) {
      const prev = toNum(r.prev_amount);
      const curr = toNum(r.curr_amount);
      const ytd = toNum(r.ytd_amount);
      const diff = curr - prev;
      const pct = prev === 0 ? "" : ((diff / prev) * 100).toFixed(1) + "%";

      lines.push(
        [
          csvEscape(String(r.channel_code ?? "")),
          String(prev),
          String(curr),
          String(diff),
          csvEscape(pct),
          String(ytd),
        ].join(",")
      );
    }

    // TOTAL 行
    const tDiff = total.curr - total.prev;
    const tPct = total.prev === 0 ? "" : ((tDiff / total.prev) * 100).toFixed(1) + "%";
    lines.push(
      ["TOTAL", String(total.prev), String(total.curr), String(tDiff), csvEscape(tPct), String(total.ytd)].join(",")
    );

    const csv = lines.join("\n");
    const filename = `kpi_monthly_summary_${meta.fyLabel}_${meta.fileSuffix}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
