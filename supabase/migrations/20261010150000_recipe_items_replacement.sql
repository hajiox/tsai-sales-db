-- A complete composition is one immutable, idempotent business operation.
-- These internal records are intentionally absent from the business-table registry.
create table if not exists public.recipe_items_replacement_changes (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.data_access_connections(id),
  recipe_id uuid not null, expected_version text not null,
  items jsonb not null check(jsonb_typeof(items)='array'), before_data jsonb not null,
  request_hash text not null, idempotency_key text not null,
  status text not null default 'pending' check(status in ('pending','applied','rejected')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '24 hours'),
  result jsonb, unique(connection_id,idempotency_key)
);
create table if not exists public.recipe_items_replacement_audit (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null unique references public.recipe_items_replacement_changes(id),
  connection_id uuid not null references public.data_access_connections(id), actor text not null,
  recipe_id uuid not null, before_data jsonb not null, after_data jsonb not null,
  related jsonb not null, created_at timestamptz not null default now()
);
alter table public.recipe_items_replacement_changes enable row level security;
alter table public.recipe_items_replacement_audit enable row level security;
revoke all on public.recipe_items_replacement_changes,public.recipe_items_replacement_audit from public,anon,authenticated,service_role;
grant select on public.recipe_items_replacement_changes,public.recipe_items_replacement_audit to service_role;
create index if not exists recipe_items_replacement_audit_created on public.recipe_items_replacement_audit(created_at desc);
create index if not exists recipe_items_replacement_audit_connection on public.recipe_items_replacement_audit(connection_id,created_at desc);

create or replace function public.tsa_recipe_items_immutable_plan() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then raise exception 'DA_INVALID_INPUT'; end if;
  if (to_jsonb(new)-array['status','result']) is distinct from (to_jsonb(old)-array['status','result']) then raise exception 'DA_INVALID_INPUT'; end if;
  if old.status<>'pending' and to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'DA_CONFLICT'; end if;
  if old.status='pending' and new.status='pending' and new.result is distinct from old.result then raise exception 'DA_INVALID_INPUT'; end if;
  return new;
end $$;
drop trigger if exists recipe_items_replacement_changes_immutable on public.recipe_items_replacement_changes;
create trigger recipe_items_replacement_changes_immutable before update or delete on public.recipe_items_replacement_changes for each row execute function public.tsa_recipe_items_immutable_plan();
drop trigger if exists recipe_items_replacement_audit_immutable on public.recipe_items_replacement_audit;
create trigger recipe_items_replacement_audit_immutable before update or delete on public.recipe_items_replacement_audit for each row execute function public.tsa_data_access_immutable_audit();

create or replace function public.tsa_recipe_items_snapshot(p_recipe_id uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
  select jsonb_build_object('recipe',to_jsonb(r),'items',coalesce((
    select jsonb_agg(to_jsonb(i) order by i.id) from public.recipe_items i where i.recipe_id=r.id
  ),'[]'::jsonb)) from public.recipes r where r.id=p_recipe_id;
$$;

-- Select-source behavior matches the ordinary editor: refresh omitted snapshots
-- only when selecting a different source; preserve explicit manual snapshots.
-- Normalize every row before writing any row, so cost/history never sees a partial batch.
create or replace function public.tsa_recipe_items_normalize(p_recipe_id uuid,p_values jsonb,p_before jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb; source jsonb; kind text; source_field text; source_id uuid;
  source_changed boolean; field text; entry record; number_value numeric;
begin
  if jsonb_typeof(p_values) is distinct from 'object' or exists(
    select 1 from jsonb_object_keys(p_values) k where k not in ('id','item_name','item_type','ingredient_id','material_id','expense_id','intermediate_recipe_id','unit_quantity','unit_price','usage_amount','unit_weight','tax_included')
  ) then raise exception 'DA_INVALID_INPUT'; end if;
  if p_before is null and (not(p_values ? 'item_type') or not(p_values ? 'usage_amount')) then raise exception 'DA_INVALID_INPUT'; end if;
  for entry in select * from jsonb_each(p_values) loop
    if entry.key in ('id','ingredient_id','material_id','expense_id','intermediate_recipe_id') and entry.value<>'null'::jsonb
      and (jsonb_typeof(entry.value)<>'string' or entry.value#>>'{}'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'DA_INVALID_INPUT'; end if;
    if entry.key='id' and entry.value='null'::jsonb then raise exception 'DA_INVALID_INPUT'; end if;
    if entry.key in ('unit_quantity','unit_price','usage_amount','unit_weight') and entry.value<>'null'::jsonb then
      if jsonb_typeof(entry.value)<>'number' then raise exception 'DA_INVALID_INPUT'; end if;
      number_value:=(entry.value#>>'{}')::numeric;
      if abs(number_value)>1000000000 then raise exception 'DA_INVALID_INPUT'; end if;
    end if;
    if entry.key='tax_included' and jsonb_typeof(entry.value) not in ('boolean','null') then raise exception 'DA_INVALID_INPUT'; end if;
    if entry.key='item_name' and (jsonb_typeof(entry.value)<>'string' or length(entry.value#>>'{}')>2000) then raise exception 'DA_INVALID_INPUT'; end if;
  end loop;
  result:=coalesce(p_before,jsonb_build_object('id',gen_random_uuid(),'recipe_id',p_recipe_id,'created_at',now(),
    'item_name','','item_type',null,'ingredient_id',null,'material_id',null,'expense_id',null,'intermediate_recipe_id',null,
    'unit_quantity',null,'unit_price',null,'usage_amount',null,'unit_weight',null,'tax_included',null,'cost',null))||p_values;
  kind:=result->>'item_type';
  if kind is null or kind not in ('ingredient','material','expense','intermediate','product') then raise exception 'DA_INVALID_INPUT'; end if;
  source_field:=case kind when 'ingredient' then 'ingredient_id' when 'material' then 'material_id' when 'expense' then 'expense_id' else 'intermediate_recipe_id' end;
  foreach field in array array['ingredient_id','material_id','expense_id','intermediate_recipe_id'] loop
    if field<>source_field then
      if p_values->>field is not null then raise exception 'DA_INVALID_INPUT'; end if;
      result:=result||jsonb_build_object(field,null);
    end if;
  end loop;
  source_id:=(result->>source_field)::uuid;
  source_changed:=source_id is not null and (p_before is null or p_before->'item_type' is distinct from result->'item_type' or p_before->source_field is distinct from result->source_field);
  if source_id is not null then
    if kind='ingredient' then select to_jsonb(t) into source from public.ingredients t where id=source_id for share;
    elsif kind='material' then select to_jsonb(t) into source from public.materials t where id=source_id for share;
    elsif kind='expense' then select to_jsonb(t) into source from public.expenses t where id=source_id for share;
    else
      if source_id=p_recipe_id then raise exception 'DA_INVALID_INPUT'; end if;
      select to_jsonb(t) into source from public.recipes t where id=source_id for share;
    end if;
    if source is null then raise exception 'DA_CONFLICT'; end if;
    if source_changed then
      if not(p_values ? 'item_name') or btrim(coalesce(p_values->>'item_name',''))='' then result:=result||jsonb_build_object('item_name',source->>'name'); end if;
      if not(p_values ? 'unit_price') or (p_before is null and p_values->>'unit_price' is null) then
        result:=result||jsonb_build_object('unit_price',coalesce((source->>case kind when 'expense' then 'unit_price' when 'intermediate' then 'total_cost' when 'product' then 'total_cost' else 'price' end)::numeric,0));
      end if;
      if not(p_values ? 'unit_quantity') or (p_before is null and p_values->>'unit_quantity' is null) then
        result:=result||jsonb_build_object('unit_quantity',case kind when 'ingredient' then coalesce(nullif((source->>'unit_quantity')::numeric,0),1) else 1 end);
      end if;
      if not(p_values ? 'tax_included') or (p_before is null and p_values->>'tax_included' is null) then result:=result||jsonb_build_object('tax_included',(source->>'tax_included')::boolean is not false); end if;
      if kind in ('intermediate','product') and (not(p_values ? 'unit_weight') or (p_before is null and p_values->>'unit_weight' is null)) then
        result:=result||jsonb_build_object('unit_weight',coalesce((source->>'total_weight')::numeric,0)
          *case kind when 'intermediate' then coalesce((source->>'yield_rate')::numeric,1) else 1 end);
      end if;
    end if;
  end if;
  if coalesce(btrim(result->>'item_name'),'')='' then raise exception 'DA_INVALID_INPUT'; end if;
  return result||jsonb_build_object('cost',public.tsa_business_recipe_item_cost(result));
end $$;

create or replace function public.tsa_recipe_items_replace_v1(p_token_hash text,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare connection public.data_access_connections; plan public.recipe_items_replacement_changes;
  v_recipe_id uuid; recipe_row public.recipes; snapshot jsonb; final_snapshot jsonb; version text;
  request_hash text; input_item jsonb; old_item jsonb; normalized jsonb; new_items jsonb:='[]'::jsonb;
  seen_ids uuid[]:=array[]::uuid[]; item_id uuid; related jsonb; v_total_weight numeric;
begin
  if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'DA_UNAUTHORIZED'; end if;
  select * into connection from public.data_access_connections where token_hash=p_token_hash for update;
  if not found or connection.revoked_at is not null or connection.expires_at<=now() then raise exception 'DA_UNAUTHORIZED'; end if;
  if not(connection.scopes @> array['business:full']) or connection.resource_ids<>'{}'::jsonb then raise exception 'DA_FORBIDDEN'; end if;
  if p_action is null or p_action not in ('read','prepare','apply') or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768 then raise exception 'DA_INVALID_INPUT'; end if;
  if p_action='apply' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k<>'id') or jsonb_typeof(p_payload->'id') is distinct from 'string' or coalesce(p_payload->>'id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'DA_INVALID_INPUT'; end if;
    select * into plan from public.recipe_items_replacement_changes where id=(p_payload->>'id')::uuid and connection_id=connection.id for update;
    if not found then raise exception 'DA_NOT_FOUND'; end if;
    if plan.status='applied' then return plan.result; end if;
    if plan.status='rejected' then raise exception 'DA_REJECTED'; end if;
    if plan.expires_at<=now() then raise exception 'DA_EXPIRED'; end if;
    v_recipe_id:=plan.recipe_id;
  else
    if exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(case p_action when 'read' then array['recipeId'] else array['recipeId','expectedVersion','items','idempotencyKey'] end))
      or jsonb_typeof(p_payload->'recipeId') is distinct from 'string' or coalesce(p_payload->>'recipeId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'DA_INVALID_INPUT'; end if;
    v_recipe_id:=(p_payload->>'recipeId')::uuid;
    if p_action='prepare' then
      if jsonb_typeof(p_payload->'expectedVersion') is distinct from 'string' or coalesce(p_payload->>'expectedVersion','')!~'^[a-f0-9]{32}$'
        or jsonb_typeof(p_payload->'idempotencyKey') is distinct from 'string' or coalesce(p_payload->>'idempotencyKey','')!~'^[A-Za-z0-9_.:-]{8,128}$'
        or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')>100 then raise exception 'DA_INVALID_INPUT'; end if;
      request_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
      select * into plan from public.recipe_items_replacement_changes where connection_id=connection.id and idempotency_key=p_payload->>'idempotencyKey';
      if found then
        if plan.request_hash<>request_hash then raise exception 'DA_IDEMPOTENCY_CONFLICT'; end if;
        return jsonb_build_object('id',plan.id,'recipeId',plan.recipe_id,'status',plan.status,'requiresApproval',false,'expiresAt',plan.expires_at,'before',plan.before_data,'items',plan.items);
      end if;
    end if;
  end if;

  -- The parent lock also blocks new FK insertions; row locks cover updates/deletes.
  -- Lock, then snapshot again under READ COMMITTED to see transactions that just finished.
  select * into recipe_row from public.recipes r where r.id=v_recipe_id for update;
  if not found then raise exception 'DA_NOT_FOUND'; end if;
  perform 1 from public.recipe_items i where i.recipe_id=v_recipe_id order by i.id for update;
  snapshot:=public.tsa_recipe_items_snapshot(v_recipe_id); version:=md5(snapshot::text);
  if p_action='read' then
    update public.data_access_connections set last_used_at=now() where id=connection.id;
    return snapshot||jsonb_build_object('recipeId',v_recipe_id,'_version',version);
  end if;
  if version is distinct from (case p_action when 'prepare' then p_payload->>'expectedVersion' else plan.expected_version end) then raise exception 'DA_CONFLICT'; end if;
  if p_action='prepare' then
    for input_item in select value from jsonb_array_elements(p_payload->'items') loop
      old_item:=null;
      if input_item ? 'id' then
        item_id:=(input_item->>'id')::uuid;
        if item_id is null or item_id=any(seen_ids) then raise exception 'DA_INVALID_INPUT'; end if;
        select value into old_item from jsonb_array_elements(snapshot->'items') where value->>'id'=item_id::text;
        if old_item is null then raise exception 'DA_INVALID_INPUT'; end if;
        seen_ids:=array_append(seen_ids,item_id);
      end if;
      normalized:=public.tsa_recipe_items_normalize(v_recipe_id,input_item,old_item);
      new_items:=new_items||jsonb_build_array(normalized);
    end loop;
    insert into public.recipe_items_replacement_changes(connection_id,recipe_id,expected_version,items,before_data,request_hash,idempotency_key)
      values(connection.id,v_recipe_id,version,new_items,snapshot,request_hash,p_payload->>'idempotencyKey') returning * into plan;
    update public.data_access_connections set last_used_at=now() where id=connection.id;
    return jsonb_build_object('id',plan.id,'recipeId',v_recipe_id,'status','pending','requiresApproval',false,'expiresAt',plan.expires_at,'before',snapshot,'items',new_items);
  end if;

  -- Keep existing IDs and timestamps. Only omitted rows are deleted; newly assigned
  -- UUIDs cannot be supplied by the caller and can never overwrite another recipe.
  delete from public.recipe_items i where i.recipe_id=v_recipe_id and not exists(select 1 from jsonb_array_elements(plan.items) value where value->>'id'=i.id::text);
  for normalized in select value from jsonb_array_elements(plan.items) loop
    item_id:=(normalized->>'id')::uuid;
    if exists(select 1 from jsonb_array_elements(snapshot->'items') value where value->>'id'=item_id::text) then
      update public.recipe_items i set item_name=r.item_name,item_type=r.item_type,ingredient_id=r.ingredient_id,
        material_id=r.material_id,expense_id=r.expense_id,intermediate_recipe_id=r.intermediate_recipe_id,
        unit_quantity=r.unit_quantity,unit_price=r.unit_price,usage_amount=r.usage_amount,unit_weight=r.unit_weight,tax_included=r.tax_included,cost=r.cost
      from jsonb_populate_record(null::public.recipe_items,normalized) r where i.id=item_id and i.recipe_id=v_recipe_id;
      if not found then raise exception 'DA_CONFLICT'; end if;
    else
      insert into public.recipe_items select r.* from jsonb_populate_record(null::public.recipe_items,normalized) r;
    end if;
  end loop;
  -- Materials/expenses have no food weight. In gram mode usage is already grams;
  -- in multiplier mode multiply usage by the selected recipe's unit weight.
  select coalesce(sum(case when i.item_type='ingredient' then coalesce(i.usage_amount,0)
    when i.item_type in ('intermediate','product') and i.unit_quantity=-1 then coalesce(i.usage_amount,0)
    when i.item_type in ('intermediate','product') then coalesce(i.usage_amount,0)*coalesce(i.unit_weight,0) else 0 end),0)
    into v_total_weight from public.recipe_items i where i.recipe_id=v_recipe_id;
  update public.recipes r set total_weight=v_total_weight where r.id=v_recipe_id and r.total_weight is distinct from v_total_weight;
  select * into recipe_row from public.recipes r where r.id=v_recipe_id;
  related:=public.tsa_business_sync_related('recipes',null,to_jsonb(recipe_row));
  final_snapshot:=public.tsa_recipe_items_snapshot(v_recipe_id);
  insert into public.recipe_items_replacement_audit(change_id,connection_id,actor,recipe_id,before_data,after_data,related)
    values(plan.id,connection.id,connection.label,v_recipe_id,snapshot,final_snapshot,related);
  plan.result:=final_snapshot||jsonb_build_object('id',plan.id,'recipeId',v_recipe_id,'status','applied','_version',md5(final_snapshot::text),'related',related);
  update public.recipe_items_replacement_changes set status='applied',result=plan.result where id=plan.id;
  update public.data_access_connections set last_used_at=now() where id=connection.id;
  return plan.result;
exception
  when unique_violation or foreign_key_violation or deadlock_detected or serialization_failure then raise exception 'DA_CONFLICT';
  when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range or not_null_violation or check_violation or string_data_right_truncation then raise exception 'DA_INVALID_INPUT';
end $$;

revoke all on function public.tsa_recipe_items_immutable_plan(),public.tsa_recipe_items_snapshot(uuid),public.tsa_recipe_items_normalize(uuid,jsonb,jsonb),public.tsa_recipe_items_replace_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsa_recipe_items_replace_v1(text,text,jsonb) to service_role;
