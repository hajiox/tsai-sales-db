-- Full business connections can update existing master price/pack/tax values.
-- Preserve the earlier field restrictions on every connection without business:full.
-- Both pathways retain atomic canonical cost synchronization and native price history.
create or replace function public.tsa_data_access_validate_full_values(p_resource text,p_operation text,p_values jsonb) returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
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
  if p_operation='update' then sensitive:=true;
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

create or replace function public.tsa_data_access_v1(p_token_hash text,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  connection public.data_access_connections; plan public.data_access_changes;
  resource text; table_name text; target_id uuid; source_row jsonb; after_row jsonb; results jsonb:='[]'::jsonb; projected jsonb; rows_count integer:=0;
  required_scope text; row_version text; request_hash text; sensitive boolean; max_rows integer; cursor_id uuid; next_cursor text; query_text text;
  from_date date; to_date date; date_column text; search_expression text; restricted_ids jsonb; record record;
  column_sql text; value_sql text; update_sql text; related_before jsonb; related_after jsonb;
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
    if connection.scopes @> array['business:full'] and connection.resource_ids='{}'::jsonb then
    perform public.tsa_data_access_validate_full_values(resource,p_payload->>'operation',p_payload->'values');
  else
    perform public.tsa_data_access_validate_values(resource,p_payload->>'operation',p_payload->'values');
  end if;
    sensitive:=false;
    request_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
    select * into plan from public.data_access_changes where connection_id=connection.id and idempotency_key=p_payload->>'idempotencyKey';
    if found then
      if plan.request_hash<>request_hash then raise exception 'DA_IDEMPOTENCY_CONFLICT'; end if;
      return jsonb_build_object('id',plan.id,'resource',plan.resource,'recordId',plan.record_id,'status',plan.status,'requiresApproval',false,'expiresAt',plan.expires_at,'values',plan.values,'before',public.tsa_data_access_project(plan.resource,coalesce(plan.before_data,'{}'::jsonb)));
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
    return jsonb_build_object('id',plan.id,'resource',plan.resource,'recordId',plan.record_id,'status',plan.status,'requiresApproval',false,'expiresAt',plan.expires_at,'values',plan.values,'before',public.tsa_data_access_project(resource,coalesce(source_row,'{}'::jsonb)));
  end if;
  -- Apply uses only the stored plan. Revocation, scopes and object bounds were checked again above.
  if plan.status='applied' then return plan.result; end if;
  if plan.status='rejected' then raise exception 'DA_REJECTED'; end if;
  if plan.expires_at<=now() then raise exception 'DA_EXPIRED'; end if;
  -- Registration and permitted updates use connection authorization; no separate human approval.
  if connection.scopes @> array['business:full'] and connection.resource_ids='{}'::jsonb then
    perform public.tsa_data_access_validate_full_values(resource,plan.operation,plan.values);
  else
    perform public.tsa_data_access_validate_values(resource,plan.operation,plan.values);
  end if;
  -- Existing immutable pending plans remain applicable without rewriting their historical approval flag.
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
  end if;
  if after_row is null then raise exception 'DA_CONFLICT'; end if;
  projected:=public.tsa_business_sync_related(table_name,plan.before_data,after_row);
  related_before:=projected->'before'; related_after:=projected->'after';
  execute format('select to_jsonb(t) from public.%I t where id=$1',table_name) into after_row using target_id;
  insert into public.data_access_audit(connection_id,change_id,actor,resource,operation,record_id,before_data,after_data,related_before,related_after,approved_by)
    values(connection.id,plan.id,connection.label,resource,plan.operation,target_id,plan.before_data,after_row,related_before,related_after,plan.approved_by);
  projected:=public.tsa_data_access_project(resource,after_row)||jsonb_build_object('_version',public.tsa_data_access_version(resource,after_row));
  plan.result:=jsonb_build_object('id',plan.id,'status','applied','record',projected);
  update public.data_access_changes set status='applied',result=plan.result where id=plan.id;
  update public.data_access_connections set last_used_at=now() where id=connection.id;
  return plan.result;
end $$;

revoke all on function public.tsa_data_access_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsa_data_access_v1(text,text,jsonb) to service_role;

revoke all on function public.tsa_data_access_validate_full_values(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsa_data_access_validate_full_values(text,text,jsonb) to service_role;
