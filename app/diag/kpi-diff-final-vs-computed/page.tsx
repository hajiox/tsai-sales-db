export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const JPY = (n:number)=>new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(n||0);
const CHS = ["WEB","WHOLESALE","STORE","SHOKU","OTHER"];

export default async function Page(){
  const res = await fetch(`/api/diag/kpi-diff-final-vs-computed`, { cache:"no-store" });
  const data = await res.json();

  if(!data?.ok){
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">final vs computed 差分</h1>
        <pre className="mt-4 text-xs whitespace-pre-wrap">{JSON.stringify(data,null,2)}</pre>
      </main>
    );
  }

  const months: string[] = data.months;

  return (
    <main className="p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">final_v1 vs computed_v2 差分（{data.fy.label}）</h1>
        <p className="text-sm text-neutral-500">
          値は <code>final - computed</code>。≠0 のセルのみ強調表示。
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">月次差分（非0のみ強調）</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left w-[120px]">month</th>
                {CHS.map(c=><th key={c} className="px-3 py-2 text-right">{c}</th>)}
                <th className="px-3 py-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m=>{
                const row = data.delta[m] || {};
                const has = Object.keys(row).length>0;
                if(!has) return (
                  <tr key={m} className="border-t">
                    <td className="px-3 py-2 font-medium">{m}</td>
                    {CHS.map(c=> <td key={`${m}-${c}`} className="px-3 py-2 text-right">—</td>)}
                    <td className="px-3 py-2 text-right">—</td>
                  </tr>
                );
                return (
                  <tr key={m} className="border-t">
                    <td className="px-3 py-2 font-medium">{m}</td>
                    {CHS.map(c=>{
                      const v = row[c] ?? 0;
                      const hit = v !== 0;
                      return <td key={`${m}-${c}`} className={`px-3 py-2 text-right ${hit?"font-semibold text-red-600":""}`}>{hit? JPY(v): "—"}</td>;
                    })}
                    <td className={`px-3 py-2 text-right ${row.TOTAL? "font-semibold text-red-600":""}`}>{row.TOTAL? JPY(row.TOTAL): "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

