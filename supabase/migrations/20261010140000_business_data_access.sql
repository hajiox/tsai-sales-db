-- Full business-data access is an explicit connection capability, never a DB/code credential.
-- The registry is fixed at review time; newly created tables are not exposed automatically.
do $$ declare constraint_name text; begin
  for constraint_name in select conname from pg_constraint where conrelid='public.data_access_connections'::regclass and contype='c' and pg_get_constraintdef(oid) like '%scopes <@%' loop
    execute format('alter table public.data_access_connections drop constraint %I',constraint_name);
  end loop;
  alter table public.data_access_connections add constraint data_access_connections_scopes_check check (scopes <@ array['recipes:read','recipes:write','ingredients:read','ingredients:write','materials:read','materials:write','expenses:read','expenses:write','reviews:read','sales:read','business:full']::text[]);
end $$;

create table if not exists public.business_data_access_changes (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.data_access_connections(id),
  table_name text not null, operation text not null check(operation in ('create','update','delete')),
  record_key jsonb, expected_version text, values jsonb not null, before_data jsonb,
  request_hash text not null, idempotency_key text not null, status text not null default 'pending' check(status in ('pending','applied','rejected')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '24 hours'), result jsonb,
  unique(connection_id,idempotency_key)
);
create table if not exists public.business_data_access_audit (
  id uuid primary key default gen_random_uuid(), change_id uuid not null unique references public.business_data_access_changes(id),
  connection_id uuid not null references public.data_access_connections(id), actor text not null,
  table_name text not null, operation text not null, record_key jsonb not null,
  before_data jsonb, after_data jsonb, related jsonb, created_at timestamptz not null default now()
);
alter table public.business_data_access_changes enable row level security;
alter table public.business_data_access_audit enable row level security;
revoke all on public.business_data_access_changes,public.business_data_access_audit from public,anon,authenticated,service_role;
grant select on public.business_data_access_changes,public.business_data_access_audit to service_role;
create index if not exists business_data_access_audit_created on public.business_data_access_audit(created_at desc);

create or replace function public.tsa_business_immutable_plan() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if (to_jsonb(new)-array['status','result']) is distinct from (to_jsonb(old)-array['status','result']) then raise exception 'DA_INVALID_INPUT'; end if;
  if old.status in ('applied','rejected') and to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'DA_CONFLICT'; end if;
  return new;
end $$;
drop trigger if exists business_data_access_changes_immutable on public.business_data_access_changes;
create trigger business_data_access_changes_immutable before update on public.business_data_access_changes for each row execute function public.tsa_business_immutable_plan();
drop trigger if exists business_data_access_audit_immutable on public.business_data_access_audit;
create trigger business_data_access_audit_immutable before update or delete on public.business_data_access_audit for each row execute function public.tsa_data_access_immutable_audit();

create or replace function public.tsa_business_tables() returns text[] language sql immutable set search_path=pg_catalog,public as $$
select array[
 'account_master','account_type_override','account_type_override_name','ad_costs_monthly','advertising_costs','ai_reports','amazon_ads_performance','amazon_code_series_map','amazon_deal_histories','amazon_product_mapping','base_product_mapping',
 'brand_store_inventory_counts','brand_store_inventory_items','brand_store_mail_import_sources','brand_store_mail_imports','brand_store_product_master_imports','brand_store_sales','brand_store_sales_adjustments','bs_gap_check_signed','category_master','category_master_history',
 'char_siu_delivery_note_scans','char_siu_production_materials','char_siu_production_outputs','char_siu_production_runs','char_siu_production_settings','closing_adjustments','closing_summary','company_links','csv_product_mapping','daily_sales_report',
 'dining_items','dining_recipe_items','dining_recipes','ec_profit_monthly','equity_pdf_master','expenses','financial_statement_accounts','financial_statement_document_pages','financial_statement_documents','financial_statement_metrics','financial_statement_supplemental_records','financial_statement_uploads',
 'food_category_master','food_product_master','food_store_closing_inventories','food_store_closing_inventory_history','food_store_mail_import_sources','food_store_mail_imports','food_store_sales','general_ledger','general_ledger_raw_v1','gl_monthly_stats','gl_quarantine','gl_raw_uploads',
 'google_ads_monthly_summary','google_ads_performance','google_ads_series_mapping','ingredients','inventory','jan_codes','kpi_manual_entries_v1','label_check_images','label_checks','lp_tracking_links','lp_tracking_targets',
 'manufacturing','manufacturing_inventory_counts','manufacturing_inventory_items','materials','mercari_product_mapping','meta_ads_performance','meta_adset_series_map','monthly_account_balance','monthly_balance','oem_customers','oem_products','oem_sales','pending_estimate_items',
 'product_master','product_master_history','product_name_aliases','product_price_history','products','qoo10_product_mapping','rakuten_ads_performance','rakuten_code_series_map','rakuten_product_mapping','rakuten_product_names','rakuten_search_exclusions',
 'rcm_aliases','rcm_calculated_snapshots','rcm_ingredients','rcm_materials','rcm_part_items','rcm_parts','rcm_product_items','rcm_products','rcm_vendors',
 'recipe_images','recipe_items','recipe_review_analyses','recipe_review_sources','recipe_reviews','recipe_versions','recipe_web_images','recipes','sales_channels','series','series_master','shipping_label_exports','shipping_label_imports','shipping_label_mappings','tiktok_product_mapping','trial_balance_accounts','trial_balance_uploads',
 'v_bs_snapshot_clean_final_latest','v_equity_fallback_flags','v_financial_overview_final_latest','v_financial_overview_final_series','v_monthly_balance_with_type','v_monthly_trial_balance','v_pl_month_totals_final_latest','v_pl_month_totals_final_series','v_pl_snapshot_clean_final_latest','v_trial_balance_final_all','v_trial_balance_final_latest',
 'web_sales','web_sales_abcd_actions','web_sales_abcd_snapshots','web_sales_ai_analyses','web_sales_ai_reports','web_sales_external_mappings','web_sales_summary','web_sales_sync_items','web_sales_sync_unmatched',
 'wholesale_customers','wholesale_daily_summary','wholesale_delivery_note_sales','wholesale_inventory_counts','wholesale_inventory_items','wholesale_partner_inventory_counts','wholesale_partner_inventory_items','wholesale_product_price_history','wholesale_products','wholesale_sales','wholesale_sukeneko_master_imports','wholesale_sukeneko_product_master','yahoo_ads_performance','yahoo_code_series_map','yahoo_product_mapping'
]::text[] $$;

create or replace function public.tsa_business_metadata(p_table text) returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare relation_id oid; relation_kind "char"; primary_columns text[]; fields jsonb;
begin
  if p_table is null or not(p_table=any(public.tsa_business_tables())) then raise exception 'DA_FORBIDDEN'; end if;
  select c.oid,c.relkind into relation_id,relation_kind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=p_table and c.relkind in ('r','p','v','m');
  if relation_id is null then raise exception 'DA_NOT_FOUND'; end if;
  -- Defense against a later schema edit adding a credential to an existing business table.
  if exists(select 1 from pg_attribute where attrelid=relation_id and attnum>0 and not attisdropped and attname~* '(^|_)(token|token_hash|password|secret|credential|cookie|private_key|access_key|refresh_token|api_key)(_|$)') then raise exception 'DA_FORBIDDEN'; end if;
  select coalesce(array_agg(a.attname order by k.ordinality),array[]::text[]) into primary_columns from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum where i.indrelid=relation_id and i.indisprimary;
  select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'default',pg_get_expr(d.adbin,d.adrelid),'nullable',not a.attnotnull,
    'writable',relation_kind in ('r','p') and cardinality(primary_columns)>0 and a.attgenerated='' and a.attidentity='' and a.attname not in ('created_at','updated_at') and not(a.attname=any(primary_columns)),
    'creatable',relation_kind in ('r','p') and cardinality(primary_columns)>0 and a.attgenerated='' and a.attidentity='' and a.attname not in ('created_at','updated_at') and not(a.attname=any(primary_columns) and d.adbin is not null)) order by a.attnum),'[]'::jsonb) into fields
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=relation_id and a.attnum>0 and not a.attisdropped;
  return jsonb_build_object('table',p_table,'type',case when relation_kind in ('r','p') then 'table' else 'view' end,'primaryKey',to_jsonb(primary_columns),'fields',fields,'writable',relation_kind in ('r','p') and cardinality(primary_columns)>0);
end $$;

create or replace function public.tsa_business_validate_values(p_table text,p_operation text,p_values jsonb,p_key jsonb) returns void language plpgsql stable set search_path=pg_catalog,public as $$
declare metadata jsonb; field jsonb; entry record; type_category "char"; relation_id oid; primary_columns text[]; numeric_value numeric;
begin
  metadata:=public.tsa_business_metadata(p_table); relation_id:=to_regclass(format('public.%I',p_table));
  if not(metadata->>'writable')::boolean or p_operation not in ('create','update','delete') then raise exception 'DA_FORBIDDEN'; end if;
  select array_agg(value) into primary_columns from jsonb_array_elements_text(metadata->'primaryKey');
  if p_operation in ('update','delete') then
    if jsonb_typeof(p_key) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_key))<>cardinality(primary_columns) or exists(select 1 from unnest(primary_columns) k where not(p_key ? k) or p_key->k='null'::jsonb) then raise exception 'DA_INVALID_INPUT'; end if;
    execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I,$1) r',p_table) using p_key;
  elsif p_key is not null then raise exception 'DA_INVALID_INPUT'; end if;
  if p_operation='delete' then if p_values<>'{}'::jsonb then raise exception 'DA_INVALID_INPUT'; end if; return; end if;
  if jsonb_typeof(p_values) is distinct from 'object' or p_values='{}'::jsonb then raise exception 'DA_INVALID_INPUT'; end if;
  for entry in select key,value from jsonb_each(p_values) loop
    select f into field from jsonb_array_elements(metadata->'fields') f where f->>'name'=entry.key;
    if field is null or not coalesce((field->>case when p_operation='create' then 'creatable' else 'writable' end)::boolean,false) then raise exception 'DA_INVALID_INPUT'; end if;
    if entry.value='null'::jsonb then if not(field->>'nullable')::boolean then raise exception 'DA_INVALID_INPUT'; end if; continue; end if;
    select t.typcategory into type_category from pg_attribute a join pg_type t on t.oid=a.atttypid where a.attrelid=relation_id and a.attname=entry.key and not a.attisdropped;
    if (type_category='B' and jsonb_typeof(entry.value)<>'boolean') or (type_category='N' and jsonb_typeof(entry.value)<>'number') or (type_category='A' and jsonb_typeof(entry.value)<>'array') or (type_category not in ('B','N','A') and field->>'type' not in ('json','jsonb') and jsonb_typeof(entry.value)<>'string') then raise exception 'DA_INVALID_INPUT'; end if;
    -- Keep the established recipe/master numeric rules. Finance/sales may legitimately be negative.
    if (p_table='recipes' and entry.key=any(array['selling_price','total_weight','yield_rate','lot_size','case_quantity']))
      or (p_table='ingredients' and entry.key=any(array['unit_quantity','price','calories','protein','fat','carbohydrate','sodium','salt']))
      or (p_table='materials' and entry.key='price')
      or (p_table='expenses' and entry.key=any(array['unit_price','unit_quantity'])) then
      numeric_value:=(entry.value#>>'{}')::numeric;
      if numeric_value<0 or numeric_value>1000000000 or (entry.key in ('unit_quantity','yield_rate') and numeric_value=0) or (entry.key in ('lot_size','case_quantity') and numeric_value<>trunc(numeric_value)) then raise exception 'DA_INVALID_INPUT'; end if;
    end if;
  end loop;
  -- Native type conversion checks UUID/date/array/enum/precision without executing supplied text.
  execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I,$1) r',p_table) using p_values;
end $$;

create or replace function public.tsa_business_access_v1(p_token_hash text,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare connection public.data_access_connections; plan public.business_data_access_changes;
  table_name text; metadata jsonb; catalog jsonb:='[]'::jsonb; source_row jsonb; after_row jsonb; related jsonb;
  record_key jsonb; operation text; expected_version text; write_values jsonb; request_hash text; primary_columns text[];
  filters jsonb; selected_columns text[]; field_names text[]; entry record; row_record record; results jsonb:='[]'::jsonb; projected jsonb;
  maximum integer; page_offset integer; row_count integer:=0; column_sql text; value_sql text; update_sql text; order_sql text;
begin
  if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'DA_UNAUTHORIZED'; end if;
  select * into connection from public.data_access_connections where token_hash=p_token_hash for update;
  if not found or connection.revoked_at is not null or connection.expires_at<=now() then raise exception 'DA_UNAUTHORIZED'; end if;
  -- Explicit full access never upgrades or bypasses record-limited legacy connections.
  if not(connection.scopes @> array['business:full']) or connection.resource_ids<>'{}'::jsonb then raise exception 'DA_FORBIDDEN'; end if;
  if p_action not in ('catalog','read','prepare','apply') or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768 then raise exception 'DA_INVALID_INPUT'; end if;
  if p_action='catalog' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k<>'table') then raise exception 'DA_INVALID_INPUT'; end if;
    if p_payload ? 'table' then catalog:=jsonb_build_array(public.tsa_business_metadata(p_payload->>'table'));
    else
      foreach table_name in array public.tsa_business_tables() loop
        begin catalog:=catalog||jsonb_build_array(public.tsa_business_metadata(table_name)); exception when raise_exception then if sqlerrm not in ('DA_NOT_FOUND','DA_FORBIDDEN') then raise; end if; end;
      end loop;
    end if;
    update public.data_access_connections set last_used_at=now() where id=connection.id;
    return jsonb_build_object('tables',catalog);
  end if;
  if p_action='apply' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k<>'id') or coalesce(p_payload->>'id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'DA_INVALID_INPUT'; end if;
    select * into plan from public.business_data_access_changes where id=(p_payload->>'id')::uuid and connection_id=connection.id for update;
    if not found then raise exception 'DA_NOT_FOUND'; end if;
    if plan.status='applied' then return plan.result; end if;
    if plan.status='rejected' then raise exception 'DA_REJECTED'; end if;
    if plan.expires_at<=now() then raise exception 'DA_EXPIRED'; end if;
    table_name:=plan.table_name; operation:=plan.operation; record_key:=plan.record_key; expected_version:=plan.expected_version; write_values:=plan.values;
  else table_name:=p_payload->>'table'; end if;
  metadata:=public.tsa_business_metadata(table_name);
  select array_agg(value) into primary_columns from jsonb_array_elements_text(metadata->'primaryKey');
  select array_agg(f->>'name') into field_names from jsonb_array_elements(metadata->'fields') f;
  if p_action='read' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('table','filters','columns','limit','offset')) then raise exception 'DA_INVALID_INPUT'; end if;
    filters:=coalesce(p_payload->'filters','{}'::jsonb);
    if jsonb_typeof(filters)<>'object' or exists(select 1 from jsonb_each(filters) e where not(e.key=any(field_names)) or jsonb_typeof(e.value) not in ('string','number','boolean','null')) then raise exception 'DA_INVALID_INPUT'; end if;
    if p_payload ? 'limit' and (jsonb_typeof(p_payload->'limit')<>'number' or (p_payload->>'limit')::numeric<>trunc((p_payload->>'limit')::numeric)) then raise exception 'DA_INVALID_INPUT'; end if;
    if p_payload ? 'offset' and (jsonb_typeof(p_payload->'offset')<>'number' or (p_payload->>'offset')::numeric<>trunc((p_payload->>'offset')::numeric)) then raise exception 'DA_INVALID_INPUT'; end if;
    maximum:=coalesce((p_payload->>'limit')::integer,25); page_offset:=coalesce((p_payload->>'offset')::integer,0);
    if maximum<1 or maximum>100 or page_offset<0 or page_offset>10000 then raise exception 'DA_INVALID_INPUT'; end if;
    maximum:=least(maximum,connection.max_limit);
    if p_payload ? 'columns' then
      if jsonb_typeof(p_payload->'columns')<>'array' or jsonb_array_length(p_payload->'columns')=0 or exists(select 1 from jsonb_array_elements(p_payload->'columns') c where jsonb_typeof(c)<>'string') then raise exception 'DA_INVALID_INPUT'; end if;
      select array_agg(value) into selected_columns from jsonb_array_elements_text(p_payload->'columns');
      if not(selected_columns<@field_names) then raise exception 'DA_INVALID_INPUT'; end if;
    end if;
    select string_agg(format('t.%I',k),',' order by ordinality) into order_sql from unnest(primary_columns) with ordinality keys(k,ordinality);
    order_sql:=coalesce(order_sql,'to_jsonb(t)::text');
    for row_record in execute format('select to_jsonb(t) data from public.%I t where not exists(select 1 from jsonb_each($1) f where (to_jsonb(t)->f.key) is distinct from f.value) order by %s limit $2 offset $3',table_name,order_sql) using filters,maximum+1,page_offset loop
      row_count:=row_count+1; if row_count>maximum then exit; end if;
      source_row:=row_record.data;
      if selected_columns is null then projected:=source_row; else select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into projected from jsonb_each(source_row) where key=any(selected_columns); end if;
      results:=results||jsonb_build_array(projected||jsonb_build_object('_version',md5(source_row::text)));
    end loop;
    update public.data_access_connections set last_used_at=now() where id=connection.id;
    return jsonb_build_object('items',results,'nextOffset',case when row_count>maximum and page_offset+maximum<=10000 then page_offset+maximum else null end);
  end if;
  if p_action='prepare' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('table','operation','key','expectedVersion','values','idempotencyKey')) or coalesce(p_payload->>'idempotencyKey','')!~'^[A-Za-z0-9_.:-]{8,128}$' then raise exception 'DA_INVALID_INPUT'; end if;
    operation:=p_payload->>'operation'; record_key:=p_payload->'key'; expected_version:=p_payload->>'expectedVersion'; write_values:=coalesce(p_payload->'values','{}'::jsonb);
    if operation not in ('create','update','delete') or operation is null then raise exception 'DA_INVALID_INPUT'; end if;
    if operation='create' and (p_payload ? 'key' or p_payload ? 'expectedVersion') then raise exception 'DA_INVALID_INPUT'; end if;
    if operation in ('update','delete') and coalesce(expected_version,'')!~'^[a-f0-9]{32}$' then raise exception 'DA_INVALID_INPUT'; end if;
    perform public.tsa_business_validate_values(table_name,operation,write_values,record_key);
    request_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
    select * into plan from public.business_data_access_changes where connection_id=connection.id and idempotency_key=p_payload->>'idempotencyKey';
    if found then
      if plan.request_hash<>request_hash then raise exception 'DA_IDEMPOTENCY_CONFLICT'; end if;
      return jsonb_build_object('id',plan.id,'table',plan.table_name,'operation',plan.operation,'key',plan.record_key,'status',plan.status,'requiresApproval',false,'expiresAt',plan.expires_at,'values',plan.values,'before',plan.before_data);
    end if;
  end if;
  if operation in ('update','delete') then
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1 for update',table_name) into source_row using record_key;
    if source_row is null then raise exception 'DA_NOT_FOUND'; end if;
    if md5(source_row::text) is distinct from expected_version then raise exception 'DA_CONFLICT'; end if;
  end if;
  if p_action='prepare' then
    insert into public.business_data_access_changes(connection_id,table_name,operation,record_key,expected_version,values,before_data,request_hash,idempotency_key)
      values(connection.id,table_name,operation,record_key,expected_version,write_values,source_row,request_hash,p_payload->>'idempotencyKey') returning * into plan;
    update public.data_access_connections set last_used_at=now() where id=connection.id;
    return jsonb_build_object('id',plan.id,'table',table_name,'operation',operation,'key',record_key,'status',plan.status,'requiresApproval',false,'expiresAt',plan.expires_at,'values',write_values,'before',source_row);
  end if;
  perform public.tsa_business_validate_values(table_name,operation,write_values,record_key);
  select string_agg(format('%I',key),',' order by key),string_agg(format('r.%I',key),',' order by key),string_agg(format('%I=r.%I',key,key),',' order by key) into column_sql,value_sql,update_sql from jsonb_object_keys(write_values) key;
  if operation='create' then
    execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',table_name,column_sql,value_sql,table_name,table_name) into after_row using write_values;
    select jsonb_object_agg(k,after_row->k) into record_key from unnest(primary_columns) k;
  elsif operation='update' then
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$2) r where to_jsonb(t) @> $1 returning to_jsonb(t)',table_name,update_sql,table_name) into after_row using record_key,write_values;
  else
    execute format('delete from public.%I t where to_jsonb(t) @> $1 returning to_jsonb(t)',table_name) into projected using record_key;
    if projected is null then raise exception 'DA_CONFLICT'; end if;
    after_row:=null;
  end if;
  related:=public.tsa_business_sync_related(table_name,source_row,after_row);
  if operation<>'delete' then
    -- Related cost synchronization can change this same row; return the final committed version.
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',table_name) into after_row using record_key;
    if after_row is null then raise exception 'DA_CONFLICT'; end if;
  end if;
  insert into public.business_data_access_audit(change_id,connection_id,actor,table_name,operation,record_key,before_data,after_data,related)
    values(plan.id,connection.id,connection.label,table_name,operation,record_key,source_row,after_row,related);
  plan.result:=jsonb_build_object('id',plan.id,'status','applied','key',record_key,'record',case when after_row is null then null else after_row||jsonb_build_object('_version',md5(after_row::text)) end,'related',related);
  update public.business_data_access_changes set status='applied',result=plan.result where id=plan.id;
  update public.data_access_connections set last_used_at=now() where id=connection.id;
  return plan.result;
exception
  when unique_violation or foreign_key_violation then raise exception 'DA_CONFLICT';
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or not_null_violation or check_violation or string_data_right_truncation then raise exception 'DA_INVALID_INPUT';
end $$;

revoke all on function public.tsa_business_immutable_plan(),public.tsa_business_tables(),public.tsa_business_metadata(text),public.tsa_business_validate_values(text,text,jsonb,jsonb),public.tsa_business_access_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsa_business_access_v1(text,text,jsonb) to service_role;
