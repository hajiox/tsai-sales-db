import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
-- 1) final_v1 を“列名に依存せず”正規化（候補列から月とチャネルを抽出）
create or replace view kpi.kpi_sales_monthly_final_v1_canon as
with t as (select * from kpi.kpi_sales_monthly_final_v1)
, mapped as (
  select
    (
      case
        when upper(btrim(coalesce(to_jsonb(t)->>'channel_code', to_jsonb(t)->>'channel', to_jsonb(t)->>'channel_cd', to_jsonb(t)->>'ch','')))
             ~* '(WEB|ＥＣ|EC|ONLINE|オンラ|ネット|ＷＥＢ)' then 'WEB'
        when upper(btrim(coalesce(to_jsonb(t)->>'channel_code', to_jsonb(t)->>'channel', to_jsonb(t)->>'channel_cd', to_jsonb(t)->>'ch','')))
             ~* '(WHOLE|卸)' then 'WHOLESALE'
        when upper(btrim(coalesce(to_jsonb(t)->>'channel_code', to_jsonb(t)->>'channel', to_jsonb(t)->>'channel_cd', to_jsonb(t)->>'ch','')))
             ~* '(STORE|店舗|直営|店頭|SHOP)' then 'STORE'
        when upper(btrim(coalesce(to_jsonb(t)->>'channel_code', to_jsonb(t)->>'channel', to_jsonb(t)->>'channel_cd', to_jsonb(t)->>'ch','')))
             ~* '(SHOKU|道の駅)' then 'SHOKU'
        else upper(btrim(coalesce(to_jsonb(t)->>'channel_code', to_jsonb(t)->>'channel', to_jsonb(t)->>'channel_cd', to_jsonb(t)->>'ch','')))
      end
    ) as channel_code,
    date_trunc('month',
      coalesce(
        nullif(to_jsonb(t)->>'fiscal_month','')::date,
        to_date(nullif(to_jsonb(t)->>'fiscal_ym','')||'-01','YYYY-MM-DD'),
        to_date(nullif(to_jsonb(t)->>'ym','')||'-01','YYYY-MM-DD'),
        (to_jsonb(t)->>'fiscal_date')::date,
        (to_jsonb(t)->>'sales_date')::date
      )
    )::date as fiscal_month,
    coalesce(
      nullif(to_jsonb(t)->>'actual_amount_yen','')::numeric,
      nullif(to_jsonb(t)->>'amount_yen','')::numeric,
      nullif(to_jsonb(t)->>'amount','')::numeric,
      0::numeric
    ) as actual_amount_yen
  from t
)
select channel_code, fiscal_month, actual_amount_yen
from mapped
where fiscal_month is not null
;

-- 2) final を優先し、無い (channel, month) だけ computed で補完
--   ★アプリの期待に合わせて列名は (channel_code, month, amount) に揃える
create or replace view kpi.kpi_sales_monthly_unified_v1 as
with f as (
  select channel_code,
         fiscal_month::date as month,
         sum(actual_amount_yen)::numeric as amount
  from kpi.kpi_sales_monthly_final_v1_canon
  group by 1,2
),
c as (
  select upper(btrim(channel_code)) as channel_code,
         date_trunc('month', fiscal_month)::date as month,
         sum(actual_amount_yen)::numeric as amount
  from kpi.kpi_sales_monthly_computed_v2
  group by 1,2
)
select f.channel_code, f.month, f.amount
from f
union all
select c.channel_code, c.month, c.amount
from c
left join f on f.channel_code = c.channel_code and f.month = c.month
where f.channel_code is null
;
`;

export async function POST() {
  try {
    await pool.query('begin');
    await pool.query(SQL);
    await pool.query('commit');
    return NextResponse.json({ ok: true, message: 'unified views created/updated' });
  } catch (e:any) {
    await pool.query('rollback').catch(()=>{});
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 });
  }
}

// 便宜上 GET でも動かせるように
export async function GET() {
  return POST();
}
