// =============================
// KPI Manual Input UI（ver.6）
// Next.js (App Router) + Tailwind + shadcn/ui
// 機能: 目標(TARGET)・予算(BUDGET)・調整(ADJUSTMENT)を手入力で月次登録/更新/削除
// データは kpi.kpi_manual_monthly にUPSERT。UI は年/月・チャネル・金額・メモを入力。
// 依存: pg, zod, react-hook-form, swr（任意）。shadcn/ui はButton/Input/Select/Dialog/Toastなど。
// ランタイム: NodeJS（Edge不可）
// =============================

// ------------------------------------------------------------
// File: /lib/db.ts
// ------------------------------------------------------------
'use server';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn('[db] DATABASE_URL not set — please configure your Postgres connection string.');
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes('sslmode=disable') ? { rejectUnauthorized: false } : undefined,
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return { rows: res.rows as T[] };
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------
// File: /app/api/kpi/manual/route.ts
// REST API: GET(list), POST(upsert), DELETE(remove)
// ------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const Metric = z.enum(['TARGET', 'BUDGET', 'ADJUSTMENT']);
const Channel = z.enum(['SHOKU', 'STORE', 'WEB', 'WHOLESALE', 'TOTAL']);

const UpsertSchema = z.object({
  metric: Metric,
  channel_code: Channel,
  month: z.coerce.date(), // 文字列でもDateに変換
  amount: z.coerce.number().int().nonnegative(),
  note: z.string().max(500).optional().default(''),
});

// GET /api/kpi/manual?year=2025&metric=TARGET
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const metric = (searchParams.get('metric') as z.infer<typeof Metric> | null) ?? null;
  const channel = (searchParams.get('channel') as z.infer<typeof Channel> | null) ?? null;

  const params: any[] = [year];
  let where = `EXTRACT(YEAR FROM month) = $1`;
  if (metric) { params.push(metric); where += ` AND metric = $${params.length}`; }
  if (channel) { params.push(channel); where += ` AND channel_code = $${params.length}`; }

  const sql = `
    SELECT metric, channel_code, month::date, amount::bigint, COALESCE(note,'') AS note, updated_at
    FROM kpi.kpi_manual_monthly
    WHERE ${where}
    ORDER BY month ASC, channel_code ASC, metric ASC;
  `;
  const { rows } = await query(sql, params);
  return NextResponse.json(rows);
}

// POST: upsert { metric, channel_code, month, amount, note? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpsertSchema.parse(body);
    const monthFirst = new Date(parsed.month.getFullYear(), parsed.month.getMonth(), 1);

    const sql = `
      INSERT INTO kpi.kpi_manual_monthly (metric, channel_code, month, amount, note)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (metric, channel_code, month)
      DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, updated_at = now()
      RETURNING metric, channel_code, month::date, amount::bigint, COALESCE(note,'') AS note, updated_at;
    `;
    const { rows } = await query(sql, [parsed.metric, parsed.channel_code, monthFirst, parsed.amount, parsed.note ?? '']);
    return NextResponse.json(rows[0] ?? null);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Validation/DB error' }, { status: 400 });
  }
}

// DELETE: { metric, channel_code, month }
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpsertSchema.pick({ metric: true, channel_code: true, month: true }).parse(body);
    const monthFirst = new Date(parsed.month.getFullYear(), parsed.month.getMonth(), 1);

    const sql = `
      DELETE FROM kpi.kpi_manual_monthly
      WHERE metric = $1 AND channel_code = $2 AND month = $3
      RETURNING metric, channel_code, month::date;
    `;
    const { rows } = await query(sql, [parsed.metric, parsed.channel_code, monthFirst]);
    return NextResponse.json(rows[0] ?? null);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Validation/DB error' }, { status: 400 });
  }
}

// ------------------------------------------------------------
// File: /app/kpi/manual/page.tsx
// 手入力UI。年を選んで一覧＆追加・上書き・削除ができる。
// ------------------------------------------------------------
'use client';
import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { z } from 'zod';

// ===== shadcn/ui （プロジェクトに入っている前提。未導入なら Button/Input/Select を自作でもOK）
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const Metric = ['TARGET','BUDGET','ADJUSTMENT'] as const;
const Channel = ['SHOKU','STORE','WEB','WHOLESALE','TOTAL'] as const;

const fetcher = (url: string) => fetch(url).then(r => r.json());

function ymToDate(ym: string) { const [y, m] = ym.split('-').map(Number); return new Date(y, m-1, 1); }
function fmtJPY(n: number) { return `¥${(n||0).toLocaleString('ja-JP')}`; }

export default function ManualKPIPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [metric, setMetric] = useState<(typeof Metric)[number]>('TARGET');
  const { toast } = useToast?.() ?? { toast: console.log } as any;

  const { data, mutate, isLoading } = useSWR<{metric:string; channel_code:string; month:string; amount:number; note:string;}[]>(`/api/kpi/manual?year=${year}&metric=${metric}`, fetcher);

  const rows = data ?? [];
  const totalsByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const ym = r.month.slice(0,7);
      m.set(ym, (m.get(ym) || 0) + Number(r.amount||0));
    }
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b));
  }, [rows]);

  async function upsert(form: FormData) {
    const payload = {
      metric,
      channel_code: String(form.get('channel_code')),
      month: String(form.get('month')),
      amount: Number(form.get('amount')),
      note: String(form.get('note') || ''),
    };
    const res = await fetch('/api/kpi/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'save failed'); }
    await mutate();
    toast({ title: '保存しました', description: `${payload.channel_code} ${payload.month} ${fmtJPY(payload.amount)}` });
  }

  async function remove(row: any) {
    const res = await fetch('/api/kpi/manual', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metric: row.metric, channel_code: row.channel_code, month: row.month })});
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'delete failed'); }
    await mutate();
    toast({ title: '削除しました', description: `${row.channel_code} ${row.month.slice(0,7)}` });
  }

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}-01`);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">KPI手入力（{metric}）</h1>
          <p className="text-sm text-muted-foreground">対象年の月次を手入力で登録/更新できます。保存するとKPIダッシュボードに即反映されます。</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px]"><SelectValue placeholder="年" /></SelectTrigger>
            <SelectContent>
              {Array.from({length:5}, (_,i)=>String(now.getFullYear()-2+i)).map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={metric} onValueChange={(v)=> setMetric(v as any)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Metric.map(m => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>新規/上書き登録</CardTitle></CardHeader>
        <CardContent>
          <form action={async (fd) => { try { await upsert(fd); } catch(e:any){ toast({ title: '保存に失敗', description: e.message, variant: 'destructive' }); } }} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">月</label>
              <Input type="month" name="month" required defaultValue={`${year}-${String(now.getMonth()+1).padStart(2,'0')}`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">チャネル</label>
              <Select name="channel_code" defaultValue="WEB" onValueChange={(v)=>{ const hidden = document.getElementById('channel_hidden') as HTMLInputElement; if (hidden) hidden.value = v; }}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>{Channel.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
              </Select>
              <input id="channel_hidden" name="channel_code" defaultValue="WEB" hidden />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">金額（円）</label>
              <Input type="number" name="amount" min={0} step={1} placeholder="例: 4500000" required />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">メモ</label>
              <Textarea name="note" placeholder="任意" rows={1} />
            </div>
            <div className="md:col-span-5">
              <Button type="submit" className="w-full md:w-auto">保存（UPSERT）</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{year}年 {metric} 入力一覧</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>月</TableHead>
                <TableHead>チャネル</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>メモ</TableHead>
                <TableHead className="w-[90px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5}>読み込み中…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">まだ登録がありません</TableCell></TableRow>
              ) : (
                rows.map((r, idx) => (
                  <TableRow key={`${r.metric}-${r.channel_code}-${r.month}-${idx}`} className="align-top">
                    <TableCell>{r.month.slice(0,7)}</TableCell>
                    <TableCell>{r.channel_code}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtJPY(Number(r.amount||0))}</TableCell>
                    <TableCell className="max-w-[360px] truncate" title={r.note}>{r.note}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="destructive" size="sm" onClick={() => remove(r)}>削除</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="text-sm text-muted-foreground">合計（{metric}）</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>月</TableHead>
                <TableHead className="text-right">合計</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totalsByMonth.map(([ym, total]) => (
                <TableRow key={ym}>
                  <TableCell>{ym}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtJPY(total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------
// File: /SQL/bootstrap_manual_table.sql （任意：最初に一度だけ実行）
// ------------------------------------------------------------
/*
CREATE TABLE IF NOT EXISTS kpi.kpi_manual_monthly (
  metric        text NOT NULL CHECK (metric IN ('TARGET','BUDGET','ADJUSTMENT')),
  channel_code  text NOT NULL CHECK (channel_code IN ('SHOKU','STORE','WEB','WHOLESALE','TOTAL')),
  month         date NOT NULL,
  amount        bigint NOT NULL DEFAULT 0,
  note          text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metric, channel_code, month)
);
*/
