"use client";

import { useEffect, useMemo, useState } from "react";

type Resp = {
  ok: boolean;
  fy: { label: string; start: string; end: string };
  months: { m: string; ym: string }[];
  channels: { code: string; label: string }[];
  channelBlocks: {
    channel: { code: string; label: string };
    rows: { m: string; ym: string; target: number; actual: number; last_year: number; rate: number|null; yoy: number|null }[];
  }[];
  salesGoals: {
    metric: { code: string; label: string };
    rows: { m: string; ym: string; val: number }[];
  }[];
};

const JPY = (n: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);

export default function AnnualPlanEditor() {
  const [data, setData] = useState<Resp | null>(null);
  const [targets, setTargets] = useState<Record<string, number>>({}); // key: ch|m
  const [goals, setGoals] = useState<Record<string, number>>({});     // key: metric|m
  const [busy, setBusy] = useState(false);
  const months = data?.months ?? [];

  useEffect(() => {
    fetch("/api/annual-plan/data").then(r=>r.json()).then((d:Resp)=>{
      setData(d);
      // 既存の目標を初期値に展開
      const t: Record<string,number> = {};
      d.channelBlocks.forEach(cb => cb.rows.forEach(r => { t[`${cb.channel.code}|${r.m}`] = r.target ?? 0; }));
      setTargets(t);
      const g: Record<string,number> = {};
      d.salesGoals.forEach(sg => sg.rows.forEach(r => { g[`${sg.metric.code}|${r.m}`] = r.val ?? 0; }));
      setGoals(g);
    });
  }, []);

  const totalByRow = (rows: {target:number; actual:number; last_year:number}[]) => ({
    tgt: rows.reduce((s,r)=>s+(r.target||0),0),
    act: rows.reduce((s,r)=>s+(r.actual||0),0),
    ly:  rows.reduce((s,r)=>s+(r.last_year||0),0),
  });

  const onChangeTarget = (ch:string, m:string, v:string) => {
    const n = Number(v.replaceAll(",",""));
    setTargets(prev => ({...prev, [`${ch}|${m}`]: isFinite(n) ? n : 0}));
  };

  const onChangeGoal = (code:string, m:string, v:string) => {
    const n = Number(v.replaceAll(",",""));
    setGoals(prev => ({...prev, [`${code}|${m}`]: isFinite(n) ? n : 0}));
  };

  const save = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const payload = {
        fiscal_year_start: data.fy.start,
        targets: Object.entries(targets).map(([k,val])=>{
          const [channel_code, month_date] = k.split("|");
          return { channel_code, month_date, target_amount_yen: val ?? 0 };
        }),
        goals: Object.entries(goals).map(([k,val])=>{
          const [metric_code, month_date] = k.split("|");
          return { metric_code, month_date, value: val ?? 0 };
        }),
      };
      const res = await fetch("/api/annual-plan/save", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      alert("保存しました。");
    } catch (e:any) {
      alert("保存に失敗: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="text-sm text-neutral-500">読み込み中…</div>;

  return (
    <div className="space-y-10">
      {/* チャネル別ブロック（PDFのセクション相当） */}
      {data.channelBlocks.map((cb) => {
        const tot = totalByRow(cb.rows);
        return (
          <section key={cb.channel.code} className="space-y-2">
            <h2 className="text-lg font-semibold">{cb.channel.label}</h2>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="min-w-[1000px] w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-3 py-2 text-left w-[160px]">科目</th>
                    {months.map(({ym},i)=>(
                      <th key={i} className="px-3 py-2 text-right">{ym}</th>
                    ))}
                    <th className="px-3 py-2 text-right">計</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 前年度実績（readonly） */}
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium">前年度実績</td>
                    {cb.rows.map((r,i)=> <td key={i} className="px-3 py-2 text-right">{JPY(r.last_year||0)}</td>)}
                    <td className="px-3 py-2 text-right">{JPY(tot.ly)}</td>
                  </tr>
                  {/* 今年度目標（editable） */}
                  <tr className="border-t bg-neutral-50/50">
                    <td className="px-3 py-2 font-medium">今年度目標</td>
                    {cb.rows.map((r,i)=>{
                      const key = `${cb.channel.code}|${r.m}`;
                      return (
                        <td key={i} className="px-3 py-2 text-right">
                          <input
                            className="w-28 border rounded px-2 py-1 text-right"
                            value={targets[key] ?? 0}
                            onChange={(e)=>onChangeTarget(cb.channel.code, r.m, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">{JPY(cb.rows.reduce((s,r)=>s+(targets[`${cb.channel.code}|${r.m}`] ?? r.target ?? 0),0))}</td>
                  </tr>
                  {/* 実績（readonly） */}
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium">実績</td>
                    {cb.rows.map((r,i)=> <td key={i} className="px-3 py-2 text-right">{JPY(r.actual||0)}</td>)}
                    <td className="px-3 py-2 text-right">{JPY(tot.act)}</td>
                  </tr>
                  {/* 目標達成率（％） */}
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium">目標達成率（％）</td>
                    {cb.rows.map((r,i)=>{
                      const tgt = targets[`${cb.channel.code}|${r.m}`] ?? r.target ?? 0;
                      const pct = tgt === 0 ? "—" : `${((r.actual||0)/tgt*100).toFixed(0)}%`;
                      return <td key={i} className="px-3 py-2 text-right">{pct}</td>;
                    })}
                    <td className="px-3 py-2 text-right">
                      {(()=>{
                        const tgtSum = cb.rows.reduce((s,r)=>s+(targets[`${cb.channel.code}|${r.m}`] ?? r.target ?? 0),0);
                        return tgtSum===0?"—":`${(tot.act/tgtSum*100).toFixed(0)}%`;
                      })()}
                    </td>
                  </tr>
                  {/* 前年度対比（％） */}
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium">前年度対比（％）</td>
                    {cb.rows.map((r,i)=>{
                      const ly = r.last_year||0;
                      const pct = ly===0?"—":`${((r.actual||0)/ly*100).toFixed(0)}%`;
                      return <td key={i} className="px-3 py-2 text-right">{pct}</td>;
                    })}
                    <td className="px-3 py-2 text-right">{tot.ly===0?"—":`${(tot.act/tot.ly*100).toFixed(0)}%`}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* 営業目標（手入力） */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">営業目標（手入力）</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left w-[240px]">項目</th>
                {months.map(({ym},i)=> <th key={i} className="px-3 py-2 text-right">{ym}</th>)}
                <th className="px-3 py-2 text-right">計</th>
              </tr>
            </thead>
            <tbody>
              {data.salesGoals.map((sg,idx)=>{
                const rowSum = sg.rows.reduce((s,r)=>s+(goals[`${sg.metric.code}|${r.m}`] ?? r.val ?? 0),0);
                return (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2 font-medium">{sg.metric.label}</td>
                    {sg.rows.map((r,i)=>{
                      const key = `${sg.metric.code}|${r.m}`;
                      return (
                        <td key={i} className="px-3 py-2 text-right">
                          <input
                            className="w-20 border rounded px-2 py-1 text-right"
                            value={goals[key] ?? 0}
                            onChange={(e)=>onChangeGoal(sg.metric.code, r.m, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">{rowSum}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 操作 */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl border shadow-sm disabled:opacity-60">
          {busy ? "保存中…" : "保存"}
        </button>
        <a href="/api/annual-plan/export.csv" className="px-4 py-2 rounded-xl border shadow-sm">CSVダウンロード</a>
      </div>
    </div>
  );
}
