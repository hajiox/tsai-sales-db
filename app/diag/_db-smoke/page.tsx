// DB接続・クエリのスモークテスト（エラーはそのまま表示）
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function JPY(n:number){return new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(n||0);}

async function run() {
  const info = await pool.query(`
    select current_database() as db, current_user as usr, version() as ver
  `);

  // 直近FYレンジ（8月開始）
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const fyStartYear = m >= 8 ? y : y - 1;
  const start = new Date(Date.UTC(fyStartYear, 7, 1)).toISOString().slice(0,10);
  const end   = new Date(Date.UTC(fyStartYear+1, 7, 1)).toISOString().slice(0,10);

  // final/computed を最小集計で確認
  const q = (table:string)=>pool.query(`
    select upper(btrim(channel_code)) as ch, sum(actual_amount_yen)::numeric as amt
    from ${table}
    where fiscal_month >= $1 and fiscal_month < $2
    group by 1
    order by 1
  `,[start, end]);

  const [fin, comp] = await Promise.all([
    q("kpi.kpi_sales_monthly_final_v1"),
    q("kpi.kpi_sales_monthly_computed_v2")
  ]);

  return {
    ok: true,
    env: {
      db: info.rows?.[0]?.db,
      usr: info.rows?.[0]?.usr,
      ver: info.rows?.[0]?.ver?.split("\n")?.[0],
      range: { start, end }
    },
    final: fin.rows,
    computed: comp.rows,
  };
}

export default async function Page(){
  try{
    const data = await run();
    return (
      <main className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">DB Smoke</h1>
        <section className="space-y-2">
          <h2 className="text-lg font-medium">環境</h2>
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data.env,null,2)}</pre>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-medium">final_v1 合計（FYレンジ）</h2>
          <ul className="text-sm">
            {data.final.map((r:any,i:number)=>(<li key={i}>{r.ch}: {JPY(Number(r.amt)||0)}</li>))}
          </ul>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-medium">computed_v2 合計（FYレンジ）</h2>
          <ul className="text-sm">
            {data.computed.map((r:any,i:number)=>(<li key={i}>{r.ch}: {JPY(Number(r.amt)||0)}</li>))}
          </ul>
        </section>
      </main>
    );
  }catch(e:any){
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">DB Smoke</h1>
        <p className="text-sm text-red-600">エラー内容：</p>
        <pre className="mt-4 text-xs whitespace-pre-wrap">{e?.message || String(e)}</pre>
      </main>
    );
  }
}

