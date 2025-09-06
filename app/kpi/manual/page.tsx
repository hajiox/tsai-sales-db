// /app/kpi/manual/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = { metric:string; channel_code:string; month:string; amount:number; note:string; updated_at?:string };

const METRICS = ['TARGET','BUDGET','ADJUSTMENT'] as const;
const CHANNELS = ['SHOKU','STORE','WEB','WHOLESALE','TOTAL'] as const;
const fmtJPY = (n: number) => `¥${(n||0).toLocaleString('ja-JP')}`;

export default function ManualKPIPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [metric, setMetric] = useState<(typeof METRICS)[number]>('TARGET');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/kpi/manual?year=${year}&metric=${metric}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data || []);
    } catch (e:any) { setError(e?.message || 'load failed'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, metric]);

  const totalsByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const ym = r.month.slice(0,7);
      m.set(ym, (m.get(ym) || 0) + Number(r.amount||0));
    }
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b));
  }, [rows]);

  async function upsert(form: HTMLFormElement) {
    const fd = new FormData(form);
    const rawMonth = String(fd.get('month') || '');
    const monthIso = rawMonth.length === 7 ? `${rawMonth}-01` : rawMonth;
    const payload = {
      metric,
      channel_code: String(fd.get('channel_code')),
      month: monthIso,
      amount: Number(fd.get('amount')),
      note: String(fd.get('note') || ''),
    };
    const res = await fetch('/api/kpi/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { const e = await res.json().catch(()=>({error:'save failed'})); alert(e.error || '保存に失敗'); return; }
    await load();
    (form as any).reset();
    alert('保存しました');
  }

  async function remove(row: Row) {
    const res = await fetch('/api/kpi/manual', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metric: row.metric, channel_code: row.channel_code, month: row.month })});
    if (!res.ok) { const e = await res.json().catch(()=>({error:'delete failed'})); alert(e.error || '削除に失敗'); return; }
    await load();
  }

  return (
    <div style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>KPI手入力（{metric}）</h1>
          <div style={{ color: '#666', fontSize: 12 }}>対象年の月次値を登録/更新するとダッシュボードに即反映されます。</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={year} onChange={e=>setYear(Number(e.target.value))}>
            {Array.from({length:5}, (_,i)=> now.getFullYear()-2+i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={metric} onChange={e=>setMetric(e.target.value as any)}>
            {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
        <h3 style={{ marginBottom: 12 }}>新規/上書き登録</h3>
        <form onSubmit={async (e)=>{ e.preventDefault(); await upsert(e.currentTarget); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 160px 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>月</label>
              <input type="month" name="month" required defaultValue={`${year}-${String(now.getMonth()+1).padStart(2,'0')}`} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>チャネル</label>
              <select name="channel_code" defaultValue="WEB" style={{ width: '100%' }}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>金額（円）</label>
              <input type="number" name="amount" min={0} step={1} required placeholder="例: 4500000" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>メモ</label>
              <input type="text" name="note" placeholder="任意" style={{ width: '100%' }} />
            </div>
            <div>
              <button type="submit">保存（UPSERT）</button>
            </div>
          </div>
        </form>
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
        <h3 style={{ marginBottom: 12 }}>{year}年 {metric} 入力一覧</h3>
        {loading ? <div>読み込み中…</div> : error ? <div style={{color:'crimson'}}>エラー: {error}</div> : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr><th align="left">月</th><th align="left">チャネル</th><th align="right">金額</th><th align="left">メモ</th><th></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} style={{ color:'#666' }}>まだ登録がありません</td></tr>
              ) : rows.map((r, i) => (
                <tr key={`${r.metric}-${r.channel_code}-${r.month}-${i}`} style={{ borderTop:'1px solid #eee' }}>
                  <td>{r.month.slice(0,7)}</td>
                  <td>{r.channel_code}</td>
                  <td align="right">{fmtJPY(Number(r.amount||0))}</td>
                  <td title={r.note}>{r.note}</td>
                  <td align="right"><button onClick={()=>remove(r)}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 16, color:'#666', fontSize:12 }}>合計（{metric}）</div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr><th align="left">月</th><th align="right">合計</th></tr></thead>
          <tbody>
            {totalsByMonth.map(([ym, total]) => (
              <tr key={ym} style={{ borderTop:'1px solid #eee' }}>
                <td>{ym}</td>
                <td align="right">{fmtJPY(total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
