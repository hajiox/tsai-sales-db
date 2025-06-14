create or replace function public.web_sales_full_month(target_month date)
returns table (
  id uuid,
  product_id uuid,
  product_name text,
  series_name text,
  series_code int4,
  price numeric,
  amazon_count int4,
  rakuten_count int4,
  yahoo_count int4,
  mercari_count int4,
  base_count int4,
  qoo10_count int4
)
language sql stable as $$
select
  w.id,
  p.id         as product_id,
  p.name       as product_name,
  p.series     as series_name,
  p.series_code,
  p.price,
  coalesce(w.amazon_count ,0) amazon_count ,
  coalesce(w.rakuten_count,0) rakuten_count,
  coalesce(w.yahoo_count  ,0) yahoo_count  ,
  coalesce(w.mercari_count,0) mercari_count,
  coalesce(w.base_count   ,0) base_count   ,
  coalesce(w.qoo10_count  ,0) qoo10_count
from products p
left join web_sales_summary w
  on w.product_id   = p.id
 and w.report_month = target_month
order by p.series_code, p.name;
$$;

grant execute on function public.web_sales_full_month(date) to anon, authenticated;
