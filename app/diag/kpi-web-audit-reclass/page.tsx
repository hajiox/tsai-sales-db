export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function JPY(n:number){return new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(n||0);}

export default async function Page() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/diag/kpi-web-audit-reclass`, { cache:"no-store" });
  const data = await res.json();

  if (!data?.ok) {
    return <main className="p-6"><h1 className="text-xl font-semibold">WEB仮再分類（同義語集計）</h1><pre className="mt-4 text-xs">{JSON.stringify(data,null,2)}</pre></main>
  }

  const months: string[] = data.months;
  const channels = ["WEB","WHOLESALE","STORE","SHOKU","OTHER"];

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">WEB仮再分類（{data.fy.label}）</h1>
        <p className="text-sm text-neutral-500">rule: UPPER(TRIM(channel_code)) に対して /WEB|EC|NET|ONLINE/ を含むものは WEB とみなす</p>
      </header>

      <section className="space-y-2">
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left w-[120px]">month</th>
                {channels.map(c => <th key={c} className="px-3 py-2 text-right">{c}</th>)}
                <th className="px-3 py-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m=>{
                const row = data.pivot[m] || {};
                const total = data.perMonthTotal[m] || 0;
                return (
                  <tr key={m} className="border-t">
                    <td className="px-3 py-2 font-medium">{m}</td>
                    {channels.map(c => <td key={`${m}-${c}`} className="px-3 py-2 text-right">{JPY(row[c]||0)}</td>)}
                    <td className="px-3 py-2 text-right font-semibold">{JPY(total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
