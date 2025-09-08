// 可視化: 月×チャネルPivot + 警告一覧
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function JPY(n:number){return new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(n||0);}

export default async function Page() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/diag/kpi-web-audit`, { cache: "no-store" });
  const data = await res.json();

  if (!data?.ok) {
    return <main className="p-6"><h1 className="text-xl font-semibold">WEB欠損診断</h1><pre className="mt-4 text-xs">{JSON.stringify(data,null,2)}</pre></main>;
  }

  const months: string[] = data.months;
  const channels = Array.from(new Set(Object.values(data.pivot).flatMap((r:any)=>Object.keys(r)))).sort();
  const warnMonths: string[] = data.webZeroMonths;

  return (
    <main className="p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">WEB欠損診断（{data.fy.label}）</h1>
        <p className="text-sm text-neutral-500">
          Source: <code>kpi.kpi_sales_monthly_computed_v2</code>（raw集計 / 正規化=UPPER(TRIM(channel_code)））
        </p>
        <div className="text-sm">
          WEBが0かつ月合計 &gt; 0 の月:{" "}
          {warnMonths.length ? warnMonths.join(", ") : "なし"}
        </div>
        <div>
          <a className="text-sm underline" href="/api/diag/kpi-web-audit.csv">CSVダウンロード</a>
        </div>
      </header>

      {/* Pivot */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Pivot（月 × チャネル（金額））</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left w-[120px]">month</th>
                {channels.map((c)=>(
                  <th key={c} className="px-3 py-2 text-right">{c}</th>
                ))}
                <th className="px-3 py-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m)=> {
                const row = data.pivot[m] || {};
                const total = data.perMonthTotal[m] || 0;
                return (
                  <tr key={m} className={`border-t ${data.webZeroMonths.includes(m) ? "bg-yellow-50" : ""}`}>
                    <td className="px-3 py-2 font-medium">{m}</td>
                    {channels.map((c)=>(
                      <td key={`${m}-${c}`} className="px-3 py-2 text-right">{JPY(row[c] || 0)}</td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold">{JPY(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 未知チャネル一覧 */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">未知チャネル（正規 {data.canon.join(", ")} 以外）</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left w-[120px]">month</th>
                <th className="px-3 py-2 text-left">raw_channel</th>
                <th className="px-3 py-2 text-left">norm_channel</th>
                <th className="px-3 py-2 text-right">amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries<any[]>(data.unknownByMonth).flatMap(([m,list]) =>
                list.map((r,i)=>(
                  <tr key={`${m}-${i}`} className={`border-t ${data.webZeroMonths.includes(m) ? "bg-yellow-50" : ""}`}>
                    <td className="px-3 py-2">{m}</td>
                    <td className="px-3 py-2">{r.raw}</td>
                    <td className="px-3 py-2">{r.norm}</td>
                    <td className="px-3 py-2 text-right">{JPY(r.amt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* チャネル統計 */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">チャネル統計（正規化単位）</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left w-[160px]">norm_channel</th>
                <th className="px-3 py-2 text-left">raw_variants</th>
                <th className="px-3 py-2 text-left">first</th>
                <th className="px-3 py-2 text-left">last</th>
                <th className="px-3 py-2 text-right">sum</th>
              </tr>
            </thead>
            <tbody>
              {data.channelStats.sort((a:any,b:any)=>b.sum-a.sum).map((r:any,i:number)=>(
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{r.norm}</td>
                  <td className="px-3 py-2">{(r.rawVariants||[]).join(", ")}</td>
                  <td className="px-3 py-2">{r.first}</td>
                  <td className="px-3 py-2">{r.last}</td>
                  <td className="px-3 py-2 text-right">{JPY(r.sum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
