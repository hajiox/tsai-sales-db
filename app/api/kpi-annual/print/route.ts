// ================================================
// File: /app/api/kpi-annual/print/route.ts   ver.3
// Purpose: KPI 年間一覧（FY=8月開始）の印刷用HTMLを返す
// Usage : GET /api/kpi-annual/print?fy=2025  ← FY2025 (2025-08〜2026-07)
// Data  : kpi.kpi_sales_monthly_unified_v1 ＋ kpi.kpi_targets_fy_v1 を参照
// Runtime: nodejs / dynamic / no-store
// ================================================

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseFY(searchParams: URLSearchParams): number {
  const v = searchParams.get('fy');
  const n = v ? Number(v) : NaN;
  if (!Number.isFinite(n)) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1; // 1-12
    // 8月以降は当年FY、7月までは前年FY
    return m >= 8 ? y : y - 1;
  }
  return n;
}

const yen = (n: number) => (Number(n) || 0).toLocaleString('ja-JP');
const pct = (v: number | null) => v == null ? '—' : v.toFixed(1) + '%';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fy = parseFY(url.searchParams); // 例: 2025 → FY2025

  const client = await pool.connect();
  try {
    // 月別ピボット（行=月, 列=チャネル, 合計＋目標／前年）
    const pivotSql = `
      WITH fy AS (
        SELECT make_date($1::int, 8, 1)::date AS fy_start,
               make_date(($1::int)+1, 8, 1)::date AS fy_end_excl
      ),
      months AS (
        SELECT generate_series(f.fy_start, f.fy_end_excl - interval '1 month', interval '1 month')::date AS m
        FROM fy f
      ),
      u AS (
        SELECT
          CASE
            WHEN UPPER(BTRIM(channel_code)) IN ('STORE','SHOP','RETAIL','STORE_FRONT') THEN 'STORE'
            WHEN UPPER(BTRIM(channel_code)) IN ('WHOLESALE','OEM') THEN 'WHOLESALE'
            ELSE UPPER(BTRIM(channel_code))
          END AS ch,
          month::date AS month,
          COALESCE(amount,0)::numeric AS amount
        FROM kpi.kpi_sales_monthly_unified_v1, fy
        WHERE month >= (SELECT fy_start FROM fy)
          AND month <  (SELECT fy_end_excl FROM fy)
      )
      SELECT
        m.m::date AS month,
        COALESCE(SUM(u.amount) FILTER (WHERE u.ch='WEB'),0)       AS web,
        COALESCE(SUM(u.amount) FILTER (WHERE u.ch='STORE'),0)     AS store,
        COALESCE(SUM(u.amount) FILTER (WHERE u.ch='SHOKU'),0)     AS shoku,
        COALESCE(SUM(u.amount) FILTER (WHERE u.ch='WHOLESALE'),0) AS wholesale,
        COALESCE(SUM(u.amount),0)                                 AS total_all,
        COALESCE(SUM(t.target_amount),0)                          AS target_total,
        COALESCE(SUM(t.last_year_amount),0)                       AS last_year_total
      FROM months m
      LEFT JOIN u ON u.month = m.m::date
      LEFT JOIN kpi.kpi_targets_fy_v1 t
             ON t.fy = $1 AND t.month = m.m::date
      GROUP BY 1
      ORDER BY 1;
    `;

    // 年間合計（行=チャネル）
    const totalsSql = `
      WITH fy AS (
        SELECT make_date($1::int, 8, 1)::date AS fy_start,
               make_date(($1::int)+1, 8, 1)::date AS fy_end_excl
      ),
      u AS (
        SELECT
          CASE
            WHEN UPPER(BTRIM(channel_code)) IN ('STORE','SHOP','RETAIL','STORE_FRONT') THEN 'STORE'
            WHEN UPPER(BTRIM(channel_code)) IN ('WHOLESALE','OEM') THEN 'WHOLESALE'
            ELSE UPPER(BTRIM(channel_code))
          END AS ch,
          month::date AS month,
          COALESCE(amount,0)::numeric AS amount
        FROM kpi.kpi_sales_monthly_unified_v1, fy
        WHERE month >= (SELECT fy_start FROM fy)
          AND month <  (SELECT fy_end_excl FROM fy)
      )
      SELECT ch AS channel_code, SUM(amount)::numeric AS ytd_amount
      FROM u
      GROUP BY 1
      ORDER BY 1;
    `;

    const [pivotRes, totalsRes] = await Promise.all([
      client.query(pivotSql, [fy]),
      client.query(totalsSql, [fy]),
    ]);

    type Row = {
      month: string;
      web: number;
      store: number;
      shoku: number;
      wholesale: number;
      total_all: number;
      target_total: number;
      last_year_total: number;
    };

    const rows = pivotRes.rows as Row[];
    const totalsMap = new Map<string, number>();
    for (const r of totalsRes.rows as { channel_code: string; ytd_amount: number }[]) {
      totalsMap.set(r.channel_code, Number(r.ytd_amount));
    }
    const ytdAll = rows.reduce((s, r) => s + Number(r.total_all), 0);
    const ytdTarget = rows.reduce((s, r) => s + Number(r.target_total), 0);
    const ytdLast = rows.reduce((s, r) => s + Number(r.last_year_total), 0);
    const ytdAchv = ytdTarget > 0 && ytdAll > 0 ? (ytdAll / ytdTarget) * 100 : null;
    const ytdYoY = ytdLast > 0 && ytdAll > 0 ? (ytdAll / ytdLast) * 100 : null;

    // 色判定関数
    const achvColor = (v: number | null) => {
      if (v == null) return 'color:#ccc';
      if (v >= 100) return 'color:#059669; font-weight:700';
      if (v >= 80) return 'color:#d97706; font-weight:600';
      return 'color:#dc2626; font-weight:600';
    };
    const yoyColor = (v: number | null) => {
      if (v == null) return 'color:#ccc';
      if (v >= 100) return 'color:#059669; font-weight:700';
      return 'color:#dc2626; font-weight:600';
    };

    // 月名に変換
    const monthName = (m: string) => {
      const d = new Date(m);
      return `${d.getUTCMonth() + 1}月`;
    };

    // HTML（印刷CSS付き）
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>KPI 年間一覧 印刷 | FY${fy}</title>
<style>
  :root { --fg:#111; --muted:#666; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif; color:var(--fg); margin:16px; font-size:11px; }
  .wrap { margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: var(--muted); font-size: 10px; margin-bottom: 12px; }
  .btnbar { display:flex; gap:8px; margin: 8px 0; }
  .btn { border:1px solid #ccc; border-radius:6px; padding:5px 10px; background:#fff; cursor:pointer; font-size:11px; }
  table { border-collapse: collapse; width: 100%; table-layout:fixed; }
  th, td { border:1px solid #ddd; padding: 3px 5px; text-align: right; font-variant-numeric: tabular-nums; font-size:11px; }
  th { background:#f7f7f7; font-weight:600; }
  th.hdr { background:#334155; color:#fff; font-weight:600; }
  th.hdr-year { background:#1e293b; color:#fff; font-weight:700; }
  td.label, th.label { text-align: left; white-space: nowrap; font-size:11px; }
  .row-actual { background:#eff6ff; border-top:2px solid #93c5fd; }
  .row-actual td, .row-actual th { font-weight:700; color:#1e3a5f; }
  .row-target { background:#fffbeb; }
  .row-target td, .row-target th { color:#92400e; }
  .row-ly { background:#faf5ff; }
  .row-ly td, .row-ly th { color:#6b21a8; }
  .row-achv td, .row-achv th { }
  .row-yoy td, .row-yoy th { }
  tfoot td { font-weight: 600; background:#fafafa; }
  .col-year { background:#f8fafc; }
  .legend { margin-top:8px; font-size:10px; color:#666; display:flex; gap:16px; }
  .legend-swatch { display:inline-block; width:10px; height:10px; border-radius:2px; vertical-align:middle; margin-right:3px; }
  @media print { .btnbar { display:none; } body{ margin:4mm; font-size:10px; } th, td { font-size:10px; padding:2px 4px; } }
</style>
</head>
<body>
  <div class="wrap">
    <h1>売上KPIダッシュボード（FY${fy}）</h1>
    <div class="meta">期間: ${fy}-08 〜 ${fy + 1}-07 ／ 参照: kpi.kpi_sales_monthly_unified_v1 ＋ kpi.kpi_targets_fy_v1</div>
    <div class="btnbar"><button class="btn" onclick="window.print()">🖨 印刷する</button></div>
    <table>
      <colgroup>
        <col style="width:7%" />
        ${rows.map(() => `<col style="width:${86 / 13}%" />`).join('')}
        <col style="width:${86 / 13}%" />
      </colgroup>
      <thead>
        <tr>
          <th class="hdr label"></th>
          ${rows.map(r => `<th class="hdr">${monthName(r.month)}</th>`).join('')}
          <th class="hdr-year">年間</th>
        </tr>
      </thead>
      <tbody>
        ${['WEB', 'STORE', 'SHOKU', 'WHOLESALE'].map(ch => {
      const label = ch === 'WEB' ? 'WEB（EC）' : ch === 'STORE' ? '直売所' : ch === 'SHOKU' ? '食の蔵' : '卸・OEM';
      const key = ch.toLowerCase();
      const total = totalsMap.get(ch) ?? 0;
      return `<tr>
            <th class="label">${label}</th>
            ${rows.map(r => {
        const v = Number((r as any)[key] ?? 0);
        const style = v > 0 ? '' : 'color:#ccc';
        return `<td style="${style}">${yen(v)}</td>`;
      }).join('')}
            <td class="col-year">${yen(total)}</td>
          </tr>`;
    }).join('')}

        <tr class="row-actual">
          <th class="label">★ 実績合計</th>
          ${rows.map(r => {
      const v = Number(r.total_all);
      const style = v > 0 ? '' : 'color:#93c5fd';
      return `<td style="${style}">${yen(v)}</td>`;
    }).join('')}
          <td class="col-year" style="background:#dbeafe">${yen(ytdAll)}</td>
        </tr>

        <tr class="row-target">
          <th class="label">目標</th>
          ${rows.map(r => `<td>${yen(r.target_total)}</td>`).join('')}
          <td class="col-year" style="background:#fef3c7">${yen(ytdTarget)}</td>
        </tr>

        <tr class="row-achv">
          <th class="label">達成率</th>
          ${rows.map(r => {
      const v = Number(r.target_total) > 0 && Number(r.total_all) > 0 ? (Number(r.total_all) / Number(r.target_total)) * 100 : null;
      return `<td style="${achvColor(v)}">${pct(v)}</td>`;
    }).join('')}
          <td class="col-year" style="${achvColor(ytdAchv)}">${pct(ytdAchv)}</td>
        </tr>

        <tr class="row-ly">
          <th class="label">前年実績</th>
          ${rows.map(r => `<td>${yen(r.last_year_total)}</td>`).join('')}
          <td class="col-year" style="background:#f3e8ff">${yen(ytdLast)}</td>
        </tr>

        <tr class="row-yoy">
          <th class="label">前年同月比</th>
          ${rows.map(r => {
      const v = Number(r.last_year_total) > 0 && Number(r.total_all) > 0 ? (Number(r.total_all) / Number(r.last_year_total)) * 100 : null;
      return `<td style="${yoyColor(v)}">${pct(v)}</td>`;
    }).join('')}
          <td class="col-year" style="${yoyColor(ytdYoY)}">${pct(ytdYoY)}</td>
        </tr>
      </tbody>
    </table>

    <div class="legend">
      <span><span class="legend-swatch" style="background:#eff6ff;border:1px solid #93c5fd"></span>実績</span>
      <span><span class="legend-swatch" style="background:#fffbeb;border:1px solid #fbbf24"></span>目標</span>
      <span><span class="legend-swatch" style="background:#faf5ff;border:1px solid #c084fc"></span>前年</span>
      <span style="margin-left:auto">
        達成率: <span style="color:#059669;font-weight:700">≥100%</span> /
        <span style="color:#d97706;font-weight:600">80-99%</span> /
        <span style="color:#dc2626;font-weight:600">&lt;80%</span>
      </span>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'QUERY_FAILED', message: e?.message ?? String(e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
