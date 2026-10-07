-- Scoped data gateway. Only the application service role can execute these functions.
-- Tokens, immutable plans, approvals and audit are never exposed to public clients.
create table if not exists public.data_access_connections (
  id uuid primary key default gen_random_uuid(), label text not null check (length(label) between 1 and 100),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'), scopes text[] not null,
  resource_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(resource_ids) = 'object'),
  max_limit integer not null default 50 check (max_limit between 1 and 100),
  expires_at timestamptz not null, revoked_at timestamptz, last_used_at timestamptz,
  created_by text not null, created_at timestamptz not null default now(),
  check (scopes <@ array['recipes:read','recipes:write','ingredients:read','ingredients:write','materials:read','materials:write','expenses:read','expenses:write','reviews:read','sales:read']::text[])
);
create table if not exists public.data_access_changes (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.data_access_connections(id),
  resource text not null check (resource in ('recipes','ingredients','materials','expenses')),
  operation text not null check (operation in ('create','update')), record_id uuid not null,
  expected_version text, values jsonb not null, request_hash text not null,
  idempotency_key text not null, before_data jsonb, requires_approval boolean not null,
  status text not null default 'pending' check (status in ('pending','approved','applied','rejected')),
  approved_by text, approved_at timestamptz, expires_at timestamptz not null default (now()+interval '24 hours'),
  created_at timestamptz not null default now(), result jsonb,
  unique(connection_id,idempotency_key)
);
create table if not exists public.data_access_audit (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.data_access_connections(id),
  change_id uuid not null unique references public.data_access_changes(id), actor text not null,
  resource text not null, operation text not null, record_id uuid not null,
  before_data jsonb, after_data jsonb not null, related_before jsonb, related_after jsonb,
  approved_by text, created_at timestamptz not null default now()
);
create index if not exists data_access_changes_pending on public.data_access_changes(status,created_at desc);
create index if not exists data_access_audit_created on public.data_access_audit(created_at desc);
alter table public.data_access_connections enable row level security;
alter table public.data_access_changes enable row level security;
alter table public.data_access_audit enable row level security;
revoke all on table public.data_access_connections,public.data_access_changes,public.data_access_audit from public,anon,authenticated,service_role;
grant select,insert,update on table public.data_access_connections,public.data_access_changes to service_role;
grant select,insert on table public.data_access_audit to service_role;

create or replace function public.tsa_data_access_immutable_plan() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if (to_jsonb(new)-array['status','approved_by','approved_at','result']) is distinct from (to_jsonb(old)-array['status','approved_by','approved_at','result']) then
    raise exception 'DA_INVALID_INPUT';
  end if;
  if old.status in ('applied','rejected') and to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'DA_CONFLICT'; end if;
  return new;
end $$;
drop trigger if exists data_access_changes_immutable on public.data_access_changes;
create trigger data_access_changes_immutable before update on public.data_access_changes for each row execute function public.tsa_data_access_immutable_plan();

create or replace function public.tsa_data_access_immutable_audit() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'DA_INVALID_INPUT'; end $$;
drop trigger if exists data_access_audit_immutable on public.data_access_audit;
create trigger data_access_audit_immutable before update or delete on public.data_access_audit for each row execute function public.tsa_data_access_immutable_audit();

create or replace function public.tsa_data_access_table(p_resource text) returns text language plpgsql immutable set search_path=pg_catalog,public as $$
begin
  case p_resource when 'recipes' then return 'recipes'; when 'ingredients' then return 'ingredients'; when 'materials' then return 'materials'; when 'expenses' then return 'expenses'; when 'reviews' then return 'recipe_reviews'; when 'sales' then return 'web_sales_summary'; else raise exception 'DA_INVALID_INPUT'; end case;
end $$;

create or replace function public.tsa_data_access_name_key(p_name text) returns text language sql immutable set search_path=pg_catalog,public as $$
  select btrim(regexp_replace(lower(normalize(p_name,NFKC)),'[[:space:]　]+',' ','g'))
$$;

create or replace function public.tsa_data_access_project(p_resource text,p_row jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare fields text[];
begin
  fields:=case p_resource
    when 'recipes' then array['id','name','category','is_intermediate','development_date','selling_price','total_cost','manufacturing_notes','filling_quantity','filling_quantity_unit','storage_method','label_quantity','net_content_unit','sterilization_method','sterilization_temperature','sterilization_time','total_weight','amazon_fee_enabled','ingredient_label','series','series_code','product_code','yield_rate','jan_code','lot_size','case_quantity','case_size','shelf_life','web_description','product_points','ec_product_name','catchcopy']
    when 'ingredients' then array['id','name','unit_quantity','price','tax_included','calories','protein','fat','carbohydrate','sodium','salt','raw_materials','allergens','origin','manufacturer','product_description','nutrition_per']
    when 'materials' then array['id','name','unit_quantity','price','supplier','notes','tax_included']
    when 'expenses' then array['id','name','unit_price','unit_quantity','notes','tax_included']
    when 'reviews' then array['id','recipe_id','channel','rating','title','body','posted_at','collected_at']
    when 'sales' then array['id','product_id','report_month','report_date','amazon_count','rakuten_count','yahoo_count','mercari_count','base_count','qoo10_count','tiktok_count','unit_price','unit_profit_rate','unit_cost_ex_ec','amazon_amount','rakuten_amount','yahoo_amount','mercari_amount','base_amount','qoo10_amount','tiktok_amount']
    else null end;
  if fields is null then raise exception 'DA_INVALID_INPUT'; end if;
  return (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_row) where key=any(fields));
end $$;

create or replace function public.tsa_data_access_version(p_resource text,p_row jsonb) returns text language plpgsql stable set search_path=pg_catalog,public as $$
declare items jsonb;
begin
  if p_resource='recipes' then select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) into items from public.recipe_items i where i.recipe_id=(p_row->>'id')::uuid; end if;
  return md5((p_row||case when p_resource='recipes' then jsonb_build_object('recipe_items',items) else '{}'::jsonb end)::text);
end $$;

create or replace function public.tsa_data_access_allowed(p_connection public.data_access_connections,p_resource text,p_mode text,p_id uuid) returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare allowed jsonb;
begin
  if not p_connection.scopes @> array[p_resource||':'||p_mode] then return false; end if;
  if p_connection.resource_ids ? p_resource then
    allowed:=p_connection.resource_ids->p_resource;
    if jsonb_typeof(allowed)<>'array' or p_id is null then return false; end if;
    return allowed @> jsonb_build_array(p_id::text);
  end if;
  return true;
end $$;

create or replace function public.tsa_data_access_validate_values(p_resource text,p_operation text,p_values jsonb) returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare text_fields text[]; number_fields text[]; bool_fields text[]; normal_fields text[]; entry record; num numeric; sensitive boolean:=false;
begin
  if jsonb_typeof(p_values)<>'object' or p_values='{}'::jsonb then raise exception 'DA_INVALID_INPUT'; end if;
  case p_resource
    when 'recipes' then text_fields:=array['name','category','manufacturing_notes','web_description','product_points','storage_method','shelf_life','filling_quantity','filling_quantity_unit','label_quantity','net_content_unit','sterilization_method','sterilization_temperature','sterilization_time','ingredient_label']; number_fields:=array['selling_price','total_weight','yield_rate','lot_size','case_quantity']; bool_fields:=array['is_intermediate']; normal_fields:=array['manufacturing_notes','web_description','product_points'];
    when 'ingredients' then text_fields:=array['name','raw_materials','allergens','origin','manufacturer','product_description','nutrition_per']; number_fields:=array['unit_quantity','price','calories','protein','fat','carbohydrate','sodium','salt']; bool_fields:=array['tax_included']; normal_fields:=array['manufacturer','product_description'];
    when 'materials' then text_fields:=array['name','unit_quantity','supplier','notes']; number_fields:=array['price']; bool_fields:=array['tax_included']; normal_fields:=array['supplier','notes'];
    when 'expenses' then text_fields:=array['name','notes']; number_fields:=array['unit_price','unit_quantity']; bool_fields:=array['tax_included']; normal_fields:=array['notes'];
    else raise exception 'DA_INVALID_INPUT';
  end case;
  if p_operation='update' then number_fields:=array[]::text[]; bool_fields:=array[]::text[]; text_fields:=array_remove(text_fields,'category'); if p_resource='materials' then text_fields:=array_remove(text_fields,'unit_quantity'); end if;
  elsif p_operation='create' then
    sensitive:=true;
    if jsonb_typeof(p_values->'name') is distinct from 'string' or length(btrim(p_values->>'name'))=0 then raise exception 'DA_INVALID_INPUT'; end if;
    if p_resource='recipes' and (jsonb_typeof(p_values->'category') is distinct from 'string' or length(btrim(p_values->>'category'))=0) then raise exception 'DA_INVALID_INPUT'; end if;
    if p_resource<>'recipes' and not(p_values ?& array['unit_quantity',case when p_resource='expenses' then 'unit_price' else 'price' end,'tax_included']) then raise exception 'DA_INVALID_INPUT'; end if;
  else raise exception 'DA_INVALID_INPUT'; end if;
  for entry in select key,value from jsonb_each(p_values) loop
    if entry.key=any(text_fields) then
      if jsonb_typeof(entry.value) not in ('string','null') or length(entry.value#>>'{}')>(case when entry.key='name' then 300 else 10000 end) then raise exception 'DA_INVALID_INPUT'; end if;
      if entry.key in ('name','category') and (jsonb_typeof(entry.value)<>'string' or length(btrim(entry.value#>>'{}'))=0) then raise exception 'DA_INVALID_INPUT'; end if;
    elsif entry.key=any(number_fields) then
      if jsonb_typeof(entry.value) not in ('number','null') then raise exception 'DA_INVALID_INPUT'; end if;
      if jsonb_typeof(entry.value)='number' then
        num:=(entry.value#>>'{}')::numeric;
        if num<0 or num>1000000000 or (entry.key in ('unit_quantity','yield_rate') and num=0) or (entry.key in ('lot_size','case_quantity') and num<>trunc(num)) then raise exception 'DA_INVALID_INPUT'; end if;
      end if;
    elsif entry.key=any(bool_fields) then if jsonb_typeof(entry.value)<>'boolean' then raise exception 'DA_INVALID_INPUT'; end if;
    else raise exception 'DA_INVALID_INPUT'; end if;
    if not entry.key=any(normal_fields) then sensitive:=true; end if;
  end loop;
  return sensitive;
end $$;

create or replace function public.tsa_data_access_review_plan(p_id uuid,p_decision text,p_actor text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare plan public.data_access_changes; connection public.data_access_connections;
begin
  if p_decision not in ('approve','reject') or length(btrim(coalesce(p_actor,'')))=0 then raise exception 'DA_INVALID_INPUT'; end if;
  -- Use the same connection -> plan lock order as apply, including concurrent revocation.
  select * into connection from public.data_access_connections where id=(select connection_id from public.data_access_changes where id=p_id) for update;
  if not found then raise exception 'DA_NOT_FOUND'; end if;
  select * into plan from public.data_access_changes where id=p_id for update;
  if connection.revoked_at is not null or connection.expires_at<=now() then raise exception 'DA_UNAUTHORIZED'; end if;
  if plan.status not in ('pending','approved') then raise exception 'DA_CONFLICT'; end if;
  if plan.expires_at<=now() then raise exception 'DA_EXPIRED'; end if;
  if p_decision='approve' then update public.data_access_changes set status='approved',approved_by=p_actor,approved_at=now() where id=p_id;
  else update public.data_access_changes set status='rejected',approved_by=p_actor,approved_at=now() where id=p_id; end if;
  return jsonb_build_object('id',p_id,'status',case when p_decision='approve' then 'approved' else 'rejected' end);
end $$;

create or replace function public.tsa_data_access_v1(p_token_hash text,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  connection public.data_access_connections; plan public.data_access_changes;
  resource text; table_name text; target_id uuid; source_row jsonb; after_row jsonb; results jsonb:='[]'::jsonb; projected jsonb; rows_count integer:=0;
  required_scope text; row_version text; request_hash text; sensitive boolean; max_rows integer; cursor_id uuid; next_cursor text; query_text text;
  from_date date; to_date date; date_column text; search_expression text; restricted_ids jsonb; record record;
  column_sql text; value_sql text; update_sql text; item_id_column text; related_before jsonb; related_after jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'DA_UNAUTHORIZED'; end if;
  -- Serializing per connection also makes plan preparation idempotent under concurrent calls.
  select * into connection from public.data_access_connections where token_hash=p_token_hash for update;
  if not found or connection.revoked_at is not null or connection.expires_at<=now() then raise exception 'DA_UNAUTHORIZED'; end if;
  if p_action not in ('read','prepare','apply') or jsonb_typeof(p_payload)<>'object' then raise exception 'DA_INVALID_INPUT'; end if;
  if p_action='apply' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k<>'id') then raise exception 'DA_INVALID_INPUT'; end if;
    target_id:=(p_payload->>'id')::uuid;
    select * into plan from public.data_access_changes where id=target_id and connection_id=connection.id for update;
    if not found then raise exception 'DA_NOT_FOUND'; end if;
    resource:=plan.resource; target_id:=plan.record_id; required_scope:='write';
  else
    resource:=p_payload->>'resource'; required_scope:=case when p_action='read' then 'read' else 'write' end;
    target_id:=nullif(p_payload->>'id','')::uuid;
  end if;
  table_name:=public.tsa_data_access_table(resource);
  if required_scope='write' and not connection.scopes @> array[resource||':read'] then raise exception 'DA_FORBIDDEN'; end if;
  if not public.tsa_data_access_allowed(connection,resource,required_scope,target_id) then
    -- Lists are allowed for scoped IDs, but only those IDs enter the SQL result below.
    if not(p_action='read' and target_id is null and connection.scopes @> array[resource||':read'] and jsonb_typeof(connection.resource_ids->resource)='array') then raise exception 'DA_FORBIDDEN'; end if;
  end if;
  if p_action='read' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('resource','query','id','limit','cursor','from','to')) then raise exception 'DA_INVALID_INPUT'; end if;
    if p_payload ? 'limit' and (jsonb_typeof(p_payload->'limit')<>'number' or (p_payload->>'limit')::numeric<>trunc((p_payload->>'limit')::numeric)) then raise exception 'DA_INVALID_INPUT'; end if;
    max_rows:=coalesce((p_payload->>'limit')::integer,25);
    if max_rows<1 or max_rows>100 then raise exception 'DA_INVALID_INPUT'; end if;
    max_rows:=least(max_rows,connection.max_limit);
    cursor_id:=nullif(p_payload->>'cursor','')::uuid; query_text:=p_payload->>'query';
    if length(query_text)>200 or (p_payload ? 'query' and jsonb_typeof(p_payload->'query')<>'string') or (resource='sales' and query_text is not null) then raise exception 'DA_INVALID_INPUT'; end if;
    if (p_payload ? 'from' or p_payload ? 'to') and resource not in ('reviews','sales') then raise exception 'DA_INVALID_INPUT'; end if;
    from_date:=nullif(p_payload->>'from','')::date; to_date:=nullif(p_payload->>'to','')::date;
    if from_date>to_date then raise exception 'DA_INVALID_INPUT'; end if;
    date_column:=case resource when 'reviews' then 'posted_at' when 'sales' then 'report_month' else 'created_at' end;
    search_expression:=case resource when 'reviews' then 'coalesce(t.title,'''')||'' ''||coalesce(t.body,'''')' when 'sales' then '''''' else 't.name' end;
    restricted_ids:=connection.resource_ids->resource;
    for record in execute format('select to_jsonb(t) as data from public.%I t where ($1::uuid is null or t.id=$1) and ($2::uuid is null or t.id>$2) and ($3::jsonb is null or $3 @> jsonb_build_array(t.id::text)) and ($4::text is null or strpos(lower(%s),lower($4))>0) and ($5::date is null or t.%I >= $5) and ($6::date is null or t.%I <= $6) order by t.id limit $7',table_name,search_expression,date_column,date_column)
      using target_id,cursor_id,restricted_ids,query_text,from_date,to_date,max_rows+1 loop
      rows_count:=rows_count+1;
      if rows_count>max_rows then exit; end if;
      source_row:=record.data; projected:=public.tsa_data_access_project(resource,source_row)||jsonb_build_object('_version',public.tsa_data_access_version(resource,source_row));
      if resource='recipes' and target_id is not null then
        projected:=projected||jsonb_build_object('recipe_items',(select coalesce(jsonb_agg(to_jsonb(i)-'created_at' order by i.id),'[]'::jsonb) from public.recipe_items i where i.recipe_id=target_id));
      end if;
      results:=results||jsonb_build_array(projected); next_cursor:=source_row->>'id';
    end loop;
    if target_id is not null and rows_count=0 then raise exception 'DA_NOT_FOUND'; end if;
    update public.data_access_connections set last_used_at=now() where id=connection.id;
    return jsonb_build_object('items',results,'nextCursor',case when rows_count>max_rows then next_cursor else null end);
  end if;
  if p_action='prepare' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('resource','operation','id','expectedVersion','values','idempotencyKey')) then raise exception 'DA_INVALID_INPUT'; end if;
    if p_payload->>'idempotencyKey' is null or (p_payload->>'idempotencyKey') !~ '^[A-Za-z0-9_.:-]{8,128}$' then raise exception 'DA_INVALID_INPUT'; end if;
    sensitive:=public.tsa_data_access_validate_values(resource,p_payload->>'operation',p_payload->'values');
    request_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
    select * into plan from public.data_access_changes where connection_id=connection.id and idempotency_key=p_payload->>'idempotencyKey';
    if found then
      if plan.request_hash<>request_hash then raise exception 'DA_IDEMPOTENCY_CONFLICT'; end if;
      return jsonb_build_object('id',plan.id,'resource',plan.resource,'recordId',plan.record_id,'status',plan.status,'requiresApproval',plan.requires_approval,'expiresAt',plan.expires_at,'values',plan.values,'before',public.tsa_data_access_project(plan.resource,coalesce(plan.before_data,'{}'::jsonb)));
    end if;
    if p_payload->>'operation'='update' then
      if target_id is null or coalesce(p_payload->>'expectedVersion','') !~ '^[a-f0-9]{32}$' then raise exception 'DA_INVALID_INPUT'; end if;
      execute format('select to_jsonb(t) from public.%I t where id=$1 for update',table_name) into source_row using target_id;
      if source_row is null then raise exception 'DA_NOT_FOUND'; end if;
      row_version:=public.tsa_data_access_version(resource,source_row);
      if row_version<>p_payload->>'expectedVersion' then raise exception 'DA_CONFLICT'; end if;
    else
      if target_id is not null or p_payload ? 'expectedVersion' then raise exception 'DA_INVALID_INPUT'; end if;
      target_id:=gen_random_uuid(); source_row:=null;
    end if;
    insert into public.data_access_changes(connection_id,resource,operation,record_id,expected_version,values,request_hash,idempotency_key,before_data,requires_approval)
      values(connection.id,resource,p_payload->>'operation',target_id,p_payload->>'expectedVersion',p_payload->'values',request_hash,p_payload->>'idempotencyKey',source_row,sensitive) returning * into plan;
    update public.data_access_connections set last_used_at=now() where id=connection.id;
    return jsonb_build_object('id',plan.id,'resource',plan.resource,'recordId',plan.record_id,'status',plan.status,'requiresApproval',plan.requires_approval,'expiresAt',plan.expires_at,'values',plan.values,'before',public.tsa_data_access_project(resource,coalesce(source_row,'{}'::jsonb)));
  end if;
  -- Apply uses only the stored plan. Revocation, scopes and object bounds were checked again above.
  if plan.status='applied' then return plan.result; end if;
  if plan.status='rejected' then raise exception 'DA_REJECTED'; end if;
  if plan.expires_at<=now() then raise exception 'DA_EXPIRED'; end if;
  if plan.requires_approval and (plan.status<>'approved' or plan.approved_by is null) then raise exception 'DA_APPROVAL_REQUIRED'; end if;
  sensitive:=public.tsa_data_access_validate_values(resource,plan.operation,plan.values);
  if sensitive is distinct from plan.requires_approval then raise exception 'DA_INVALID_INPUT'; end if;
  if plan.values ? 'name' then
    -- Shared across connections and used by both registration and rename before record locking.
    perform pg_advisory_xact_lock(hashtextextended('tsa_data_name:'||resource||':'||public.tsa_data_access_name_key(plan.values->>'name'),0));
    execute format('select to_jsonb(t) from public.%I t where public.tsa_data_access_name_key(name)=public.tsa_data_access_name_key($1) and id<>$2 limit 1',table_name) into source_row using plan.values->>'name',target_id;
    if source_row is not null then raise exception 'DA_CONFLICT'; end if;
  end if;
  if plan.operation='update' then
    execute format('select to_jsonb(t) from public.%I t where id=$1 for update',table_name) into source_row using target_id;
    if source_row is null then raise exception 'DA_NOT_FOUND'; end if;
    if public.tsa_data_access_version(resource,source_row) is distinct from plan.expected_version then raise exception 'DA_CONFLICT'; end if;
  end if;
  -- Field names passed to format are from the validated fixed allowlist above.
  select string_agg(format('%I',key),',' order by key),string_agg(format('r.%I',key),',' order by key),string_agg(format('%I=r.%I',key,key),',' order by key) into column_sql,value_sql,update_sql from jsonb_object_keys(plan.values) key;
  if plan.operation='create' then
    execute format('insert into public.%I (id,%s) select $1,%s from jsonb_populate_record(null::public.%I,$2) r returning to_jsonb(%I.*)',table_name,column_sql,value_sql,table_name,table_name) into after_row using target_id,plan.values;
  else
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$2) r where t.id=$1 returning to_jsonb(t)',table_name,update_sql,table_name) into after_row using target_id,plan.values;
    if resource in ('ingredients','materials','expenses') and plan.values ? 'name' then
      item_id_column:=case resource when 'ingredients' then 'ingredient_id' when 'materials' then 'material_id' else 'expense_id' end;
      execute format('select coalesce(jsonb_agg(to_jsonb(i) order by i.id),''[]''::jsonb) from public.recipe_items i where %I=$1',item_id_column) into related_before using target_id;
      execute format('update public.recipe_items set item_name=$1 where %I=$2',item_id_column) using after_row->>'name',target_id;
      execute format('select coalesce(jsonb_agg(to_jsonb(i) order by i.id),''[]''::jsonb) from public.recipe_items i where %I=$1',item_id_column) into related_after using target_id;
    end if;
  end if;
  if after_row is null then raise exception 'DA_CONFLICT'; end if;
  insert into public.data_access_audit(connection_id,change_id,actor,resource,operation,record_id,before_data,after_data,related_before,related_after,approved_by)
    values(connection.id,plan.id,connection.label,resource,plan.operation,target_id,plan.before_data,after_row,related_before,related_after,plan.approved_by);
  projected:=public.tsa_data_access_project(resource,after_row)||jsonb_build_object('_version',public.tsa_data_access_version(resource,after_row));
  plan.result:=jsonb_build_object('id',plan.id,'status','applied','record',projected);
  update public.data_access_changes set status='applied',result=plan.result where id=plan.id;
  update public.data_access_connections set last_used_at=now() where id=connection.id;
  return plan.result;
end $$;

revoke all on function public.tsa_data_access_immutable_plan(),public.tsa_data_access_immutable_audit(),public.tsa_data_access_table(text),public.tsa_data_access_name_key(text),public.tsa_data_access_project(text,jsonb),public.tsa_data_access_version(text,jsonb),public.tsa_data_access_allowed(public.data_access_connections,text,text,uuid),public.tsa_data_access_validate_values(text,text,jsonb),public.tsa_data_access_review_plan(uuid,text,text),public.tsa_data_access_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsa_data_access_review_plan(uuid,text,text),public.tsa_data_access_v1(text,text,jsonb) to service_role;
