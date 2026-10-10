-- JAN issuance and recipe assignment are atomic and share the ordinary editor's prefixes.
-- No existing JAN rows are renumbered, reserved, or modified by this migration.
create table if not exists public.jan_code_operations (
 id uuid primary key default gen_random_uuid(), connection_id uuid references public.data_access_connections(id),
 scope_key text not null, actor text not null, action text not null,
 idempotency_key text not null, request_hash text not null, before_data jsonb, result jsonb not null,
 created_at timestamptz not null default now(), unique(scope_key,idempotency_key)
);
alter table public.jan_code_operations enable row level security;
revoke all on public.jan_code_operations from public,anon,authenticated,service_role;
grant select on public.jan_code_operations to service_role;
create index if not exists jan_code_operations_connection on public.jan_code_operations(connection_id,created_at desc);
create index if not exists jan_code_operations_created on public.jan_code_operations(created_at desc);
drop trigger if exists jan_code_operations_immutable on public.jan_code_operations;
create trigger jan_code_operations_immutable before update or delete on public.jan_code_operations
 for each row execute function public.tsa_data_access_immutable_audit();

create or replace function public.tsa_jan_validate_values(p_values jsonb,p_create boolean) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare e record;
begin
 if jsonb_typeof(p_values) is distinct from 'object' or p_values='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_values) k where k not in ('product_name','category','price_excl_tax','ingredients','memo')) then raise exception 'DA_INVALID_INPUT'; end if;
 if p_create and (not(p_values?'product_name') or not(p_values?'category')) then raise exception 'DA_INVALID_INPUT'; end if;
 for e in select * from jsonb_each(p_values) loop
  if e.key='category' and (jsonb_typeof(e.value)<>'string' or e.value#>>'{}' not in ('食品','物品')) then raise exception 'DA_INVALID_INPUT'; end if;
  if e.key='product_name' and (jsonb_typeof(e.value)<>'string' or length(btrim(e.value#>>'{}')) not between 1 and 2000) then raise exception 'DA_INVALID_INPUT'; end if;
  if e.key in ('ingredients','memo') and e.value<>'null'::jsonb and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>8000) then raise exception 'DA_INVALID_INPUT'; end if;
  if e.key='price_excl_tax' and e.value<>'null'::jsonb and (jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric not between 0 and 1000000000) then raise exception 'DA_INVALID_INPUT'; end if;
 end loop;
end $$;

create or replace function public.tsa_jan_issue_row(p_values jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare prefix text; next_number integer; item text; code12 text; digit text; checksum integer; row_data public.jan_codes;
begin
 perform public.tsa_jan_validate_values(p_values,true);
 prefix:=case p_values->>'category' when '食品' then '457131863' else '457131862' end;
 -- Also blocks legacy/direct inserts while MAX is read and the new row is saved.
 lock table public.jan_codes in share row exclusive mode;
 select greatest(coalesce(max(item_code::integer),0),coalesce((select max((result->'jan'->>'item_code')::integer) from public.jan_code_operations where action='issue' and result->'jan'->>'company_prefix'=prefix),0))+1
 into next_number from public.jan_codes where company_prefix=prefix and item_code~'^[0-9]{3}$';
 if next_number>999 then raise exception 'DA_EXHAUSTED'; end if;
 item:=lpad(next_number::text,3,'0'); code12:=prefix||item;
 select sum(substr(code12,n,1)::integer*case when n%2=0 then 3 else 1 end) into checksum from generate_series(1,12) n;
 digit:=((10-checksum%10)%10)::text;
 insert into public.jan_codes(jan_code,company_prefix,item_code,check_digit,product_name,category,price_excl_tax,ingredients,memo)
 values(code12||digit,prefix,item,digit,btrim(p_values->>'product_name'),p_values->>'category',(p_values->>'price_excl_tax')::numeric,p_values->>'ingredients',p_values->>'memo') returning * into row_data;
 return to_jsonb(row_data)||jsonb_build_object('_version',md5(to_jsonb(row_data)::text));
end $$;

create or replace function public.tsa_jan_issue_admin_v1(p_payload jsonb,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare receipt public.jan_code_operations; result jsonb; request_hash text;
begin
 if p_idempotency_key is null or p_idempotency_key!~'^[A-Za-z0-9_.:-]{8,128}$' then raise exception 'DA_INVALID_INPUT'; end if;
 perform public.tsa_jan_validate_values(p_payload,true);
 perform pg_advisory_xact_lock(hashtextextended('jan-admin:'||p_idempotency_key,0));
 request_hash:=md5(p_payload::text);
 select * into receipt from public.jan_code_operations where scope_key='admin-ui' and idempotency_key=p_idempotency_key;
 if found then
  if receipt.request_hash<>request_hash then raise exception 'DA_IDEMPOTENCY_CONFLICT'; end if;
  return receipt.result->'jan';
 end if;
 result:=public.tsa_jan_issue_row(p_payload);
 insert into public.jan_code_operations(scope_key,actor,action,idempotency_key,request_hash,result)
 values('admin-ui','管理画面','issue',p_idempotency_key,request_hash,jsonb_build_object('jan',result));
 return result;
exception
 when unique_violation or deadlock_detected or serialization_failure then raise exception 'DA_CONFLICT';
 when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation or string_data_right_truncation then raise exception 'DA_INVALID_INPUT';
end $$;

create or replace function public.tsa_jan_access_v1(p_token_hash text,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare connection public.data_access_connections; receipt public.jan_code_operations; jan_row public.jan_codes;
 recipe_row public.recipes; jan_data jsonb; recipe_data jsonb; before_data jsonb; result jsonb; fields jsonb;
 key text; request_hash text; limit_rows integer; offset_rows integer; items jsonb; v_id uuid; v_recipe_id uuid; v_version text;
begin
 if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'DA_UNAUTHORIZED'; end if;
 select * into connection from public.data_access_connections where token_hash=p_token_hash for update;
 if not found or connection.revoked_at is not null or connection.expires_at<=now() then raise exception 'DA_UNAUTHORIZED'; end if;
 if not(connection.scopes @> array['business:full']) or connection.resource_ids<>'{}'::jsonb then raise exception 'DA_FORBIDDEN'; end if;
 if p_action is null or p_action not in ('list','issue','assign','update','export') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'DA_INVALID_INPUT'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(case p_action
 when 'list' then array['query','category','unassigned','limit','offset'] when 'issue' then array['values','recipeId','expectedVersion','idempotencyKey']
 when 'assign' then array['janId','recipeId','expectedVersion','idempotencyKey'] when 'update' then array['janId','values','expectedVersion','idempotencyKey']
 else array['janId','format'] end)) then raise exception 'DA_INVALID_INPUT'; end if;
 if p_action='list' then
  if p_payload?'query' and (jsonb_typeof(p_payload->'query')<>'string' or length(p_payload->>'query')>200) or p_payload?'category' and (jsonb_typeof(p_payload->'category')<>'string' or p_payload->>'category' not in ('食品','物品')) or p_payload?'unassigned' and jsonb_typeof(p_payload->'unassigned')<>'boolean' then raise exception 'DA_INVALID_INPUT'; end if;
  if p_payload?'limit' and (jsonb_typeof(p_payload->'limit')<>'number' or p_payload->>'limit'!~'^[0-9]+$') or p_payload?'offset' and (jsonb_typeof(p_payload->'offset')<>'number' or p_payload->>'offset'!~'^[0-9]+$') then raise exception 'DA_INVALID_INPUT'; end if;
  limit_rows:=coalesce((p_payload->>'limit')::integer,25); offset_rows:=coalesce((p_payload->>'offset')::integer,0);
  if limit_rows not between 1 and 100 or offset_rows not between 0 and 10000 then raise exception 'DA_INVALID_INPUT'; end if;
  select coalesce(jsonb_agg(value order by code desc),'[]'::jsonb) into items from (
   select to_jsonb(j)||jsonb_build_object('_version',md5(to_jsonb(j)::text),'recipes',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'_version',public.tsa_data_access_version('recipes',to_jsonb(r))) order by r.id) from public.recipes r where r.jan_code=j.jan_code),'[]'::jsonb)) value,j.jan_code code
   from public.jan_codes j where (not(p_payload?'category') or j.category=p_payload->>'category')
    and (not coalesce((p_payload->>'unassigned')::boolean,false) or not exists(select 1 from public.recipes r where r.jan_code=j.jan_code))
    and (not(p_payload?'query') or strpos(lower(coalesce(j.product_name,'')||' '||j.jan_code||' '||coalesce(j.memo,'')),lower(p_payload->>'query'))>0)
   order by j.jan_code desc limit limit_rows+1 offset offset_rows
  ) q;
  if jsonb_array_length(items)>limit_rows then result:=jsonb_build_object('items',items-limit_rows,'nextOffset',offset_rows+limit_rows); else result:=jsonb_build_object('items',items,'nextOffset',null); end if;
 elsif p_action='export' then
  if jsonb_typeof(p_payload->'janId') is distinct from 'string' or p_payload->>'janId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p_payload?'format' and (jsonb_typeof(p_payload->'format')<>'string' or p_payload->>'format' not in ('svg','eps','png')) then raise exception 'DA_INVALID_INPUT'; end if;
  select * into jan_row from public.jan_codes where id=(p_payload->>'janId')::uuid;
  if not found then raise exception 'DA_NOT_FOUND'; end if;
  result:=jsonb_build_object('janCode',jan_row.jan_code,'format',coalesce(p_payload->>'format','svg'));
 else
  key:=p_payload->>'idempotencyKey';
  if jsonb_typeof(p_payload->'idempotencyKey') is distinct from 'string' or key!~'^[A-Za-z0-9_.:-]{8,128}$' then raise exception 'DA_INVALID_INPUT'; end if;
  request_hash:=md5(jsonb_build_object('action',p_action,'payload',p_payload)::text);
  select * into receipt from public.jan_code_operations where scope_key=connection.id::text and idempotency_key=key;
  if found then
   if receipt.request_hash<>request_hash then raise exception 'DA_IDEMPOTENCY_CONFLICT'; end if;
   update public.data_access_connections set last_used_at=now() where id=connection.id;
   return receipt.result;
  end if;
  if p_action in ('assign','update') then
   if jsonb_typeof(p_payload->'janId') is distinct from 'string' or p_payload->>'janId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'DA_INVALID_INPUT'; end if;
   v_id:=(p_payload->>'janId')::uuid;
  end if;
  if p_action='assign' or p_action='issue' and p_payload?'recipeId' then
   if jsonb_typeof(p_payload->'recipeId') is distinct from 'string' or p_payload->>'recipeId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'DA_INVALID_INPUT'; end if;
   v_recipe_id:=(p_payload->>'recipeId')::uuid;
   select * into recipe_row from public.recipes where id=v_recipe_id for update;
   if not found then raise exception 'DA_NOT_FOUND'; end if;
   recipe_data:=to_jsonb(recipe_row); before_data:=jsonb_build_object('recipe',recipe_data);
   if jsonb_typeof(p_payload->'expectedVersion') is distinct from 'string' or p_payload->>'expectedVersion'!~'^[a-f0-9]{32}$' then raise exception 'DA_INVALID_INPUT'; end if;
   -- Existing get_recipe includes items in its version; business_read returns the row version.
   -- Both are accepted only when they still describe the current recipe.
   if p_payload->>'expectedVersion'<>md5(recipe_data::text) and p_payload->>'expectedVersion'<>public.tsa_data_access_version('recipes',recipe_data) then raise exception 'DA_CONFLICT'; end if;
   if p_action='issue' and btrim(coalesce(recipe_row.jan_code,''))<>'' then raise exception 'DA_CONFLICT'; end if;
  elsif p_action='issue' and p_payload?'expectedVersion' then raise exception 'DA_INVALID_INPUT'; end if;
  if p_action='issue' then
   jan_data:=public.tsa_jan_issue_row(p_payload->'values');
  else
   select * into jan_row from public.jan_codes where id=v_id for update;
   if not found then raise exception 'DA_NOT_FOUND'; end if;
   jan_data:=to_jsonb(jan_row); before_data:=coalesce(before_data,'{}'::jsonb)||jsonb_build_object('jan',jan_data);
   if p_action='update' then
    if jsonb_typeof(p_payload->'expectedVersion') is distinct from 'string' or p_payload->>'expectedVersion'!~'^[a-f0-9]{32}$' then raise exception 'DA_INVALID_INPUT'; end if;
    if p_payload->>'expectedVersion'<>md5(jan_data::text) then raise exception 'DA_CONFLICT'; end if;
    fields:=p_payload->'values'; perform public.tsa_jan_validate_values(fields,false);
    -- Category determines the GS1 prefix and cannot be relabeled after issuance.
    if fields?'category' and fields->>'category'<>jan_row.category then raise exception 'DA_INVALID_INPUT'; end if;
    jan_data:=jan_data||fields;
    update public.jan_codes j set product_name=r.product_name,price_excl_tax=r.price_excl_tax,ingredients=r.ingredients,memo=r.memo
    from jsonb_populate_record(null::public.jan_codes,jan_data) r where j.id=v_id returning j.* into jan_row;
   end if;
   jan_data:=to_jsonb(jan_row)||jsonb_build_object('_version',md5(to_jsonb(jan_row)::text));
  end if;
  if v_recipe_id is not null then
   update public.recipes set jan_code=jan_data->>'jan_code' where id=v_recipe_id returning * into recipe_row;
   recipe_data:=to_jsonb(recipe_row)||jsonb_build_object('_version',public.tsa_data_access_version('recipes',to_jsonb(recipe_row)));
  end if;
  result:=jsonb_build_object('jan',jan_data,'recipe',recipe_data);
  insert into public.jan_code_operations(connection_id,scope_key,actor,action,idempotency_key,request_hash,before_data,result)
   values(connection.id,connection.id::text,connection.label,p_action,key,request_hash,before_data,result);
 end if;
 update public.data_access_connections set last_used_at=now() where id=connection.id;
 return result;
exception
 when unique_violation or foreign_key_violation or deadlock_detected or serialization_failure then raise exception 'DA_CONFLICT';
 when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range or not_null_violation or check_violation or string_data_right_truncation then raise exception 'DA_INVALID_INPUT';
end $$;
revoke all on function public.tsa_jan_validate_values(jsonb,boolean),public.tsa_jan_issue_row(jsonb),public.tsa_jan_issue_admin_v1(jsonb,text),public.tsa_jan_access_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsa_jan_issue_admin_v1(jsonb,text),public.tsa_jan_access_v1(text,text,jsonb) to service_role;
