-- Dedicated business operations retain the existing scoped connection, never browser/Bridge credentials.
create table if not exists public.business_operation_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.data_access_connections(id),
  operation text not null check(operation ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9_.:-]{8,120}$'),
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  actor text not null,
  state text not null default 'running' check(state in ('running','completed','failed','unknown')),
  result jsonb, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(connection_id,idempotency_key),
  check(result is null or octet_length(result::text)<=4194304)
);
alter table public.business_operation_runs enable row level security;
revoke all on public.business_operation_runs from public,anon,authenticated,service_role;
grant select on public.business_operation_runs to service_role;

create or replace function public.tsa_business_operation_immutable() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if (to_jsonb(new)-array['state','result','completed_at']) is distinct from (to_jsonb(old)-array['state','result','completed_at'])
    or old.state<>'running' or new.state='running' then raise exception 'DA_CONFLICT'; end if;
  return new;
end $$;
drop trigger if exists business_operation_runs_immutable on public.business_operation_runs;
create trigger business_operation_runs_immutable before update on public.business_operation_runs
for each row execute function public.tsa_business_operation_immutable();
drop trigger if exists business_operation_runs_no_delete on public.business_operation_runs;
create trigger business_operation_runs_no_delete before delete on public.business_operation_runs
for each row execute function public.tsa_data_access_immutable_audit();

create or replace function public.tsa_business_operation_v1(p_token_hash text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare connection public.data_access_connections; operation_run public.business_operation_runs; claimed boolean:=false; result jsonb;
begin
  if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'DA_UNAUTHORIZED'; end if;
  -- This lock also serializes permission/revocation changes and simultaneous claims of the same key.
  select * into connection from public.data_access_connections where token_hash=p_token_hash for update;
  if not found or connection.revoked_at is not null or connection.expires_at<=now() then raise exception 'DA_UNAUTHORIZED'; end if;
  if not(connection.scopes @> array['business:full']) or connection.resource_ids<>'{}'::jsonb then raise exception 'DA_FORBIDDEN'; end if;
  if coalesce(p_action,'') not in ('authorize','claim','status','finish') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'DA_INVALID_INPUT'; end if;
  if p_action='authorize' then
    if p_payload<>'{}'::jsonb then raise exception 'DA_INVALID_INPUT'; end if;
  elsif p_action='claim' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('operation','idempotencyKey','inputHash'))
      or coalesce(p_payload->>'operation','')!~'^[a-z][a-z0-9_.-]{0,99}$'
      or coalesce(p_payload->>'idempotencyKey','')!~'^[A-Za-z0-9_.:-]{8,120}$'
      or coalesce(p_payload->>'inputHash','')!~'^[a-f0-9]{64}$' then raise exception 'DA_INVALID_INPUT'; end if;
    select * into operation_run from public.business_operation_runs where connection_id=connection.id and idempotency_key=p_payload->>'idempotencyKey';
    if found then
      if operation_run.operation<>p_payload->>'operation' or operation_run.input_hash<>p_payload->>'inputHash' then raise exception 'DA_IDEMPOTENCY_CONFLICT'; end if;
    else
      insert into public.business_operation_runs(connection_id,operation,idempotency_key,input_hash,actor)
        values(connection.id,p_payload->>'operation',p_payload->>'idempotencyKey',p_payload->>'inputHash','data-access:'||connection.id::text)
        returning * into operation_run;
      claimed:=true;
    end if;
  elsif p_action='status' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('operationId','idempotencyKey'))
      or (p_payload ? 'operationId')=(p_payload ? 'idempotencyKey') then raise exception 'DA_INVALID_INPUT'; end if;
    if p_payload ? 'operationId' then
      if coalesce(p_payload->>'operationId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'DA_INVALID_INPUT'; end if;
      select * into operation_run from public.business_operation_runs where id=(p_payload->>'operationId')::uuid and connection_id=connection.id;
    else
      if coalesce(p_payload->>'idempotencyKey','')!~'^[A-Za-z0-9_.:-]{8,120}$' then raise exception 'DA_INVALID_INPUT'; end if;
      select * into operation_run from public.business_operation_runs where idempotency_key=p_payload->>'idempotencyKey' and connection_id=connection.id;
    end if;
    if not found then raise exception 'DA_NOT_FOUND'; end if;
  else
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('operationId','state','result'))
      or coalesce(p_payload->>'operationId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(p_payload->>'state','') not in ('completed','failed','unknown')
      or not(p_payload ? 'result') or octet_length((p_payload->'result')::text)>4194304 then raise exception 'DA_INVALID_INPUT'; end if;
    select * into operation_run from public.business_operation_runs where id=(p_payload->>'operationId')::uuid and connection_id=connection.id for update;
    if not found then raise exception 'DA_NOT_FOUND'; end if;
    if operation_run.state='running' then
      update public.business_operation_runs set state=p_payload->>'state',result=p_payload->'result',completed_at=now() where id=operation_run.id returning * into operation_run;
    end if;
  end if;
  result:=jsonb_build_object('connectionId',connection.id,'actor','data-access:'||connection.id::text);
  if operation_run.id is not null then
    result:=result||jsonb_build_object('claimed',claimed,'operation',jsonb_build_object('operationId',operation_run.id,'operation',operation_run.operation,'state',operation_run.state,'result',operation_run.result,'createdAt',operation_run.created_at,'completedAt',operation_run.completed_at));
  end if;
  return result;
end $$;

revoke all on function public.tsa_business_operation_immutable(),public.tsa_business_operation_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsa_business_operation_v1(text,text,jsonb) to service_role;

-- JAN numbers and issuance history must use the atomic dedicated JAN workflow.
-- Generic read remains available; dedicated JAN APIs and the ordinary UI are unaffected.
create or replace function public.tsa_business_metadata(p_table text) returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare relation_id oid; relation_kind "char"; primary_columns text[]; fields jsonb;
begin
  if p_table is null or not(p_table=any(public.tsa_business_tables())) then raise exception 'DA_FORBIDDEN'; end if;
  select c.oid,c.relkind into relation_id,relation_kind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=p_table and c.relkind in ('r','p','v','m');
  if relation_id is null then raise exception 'DA_NOT_FOUND'; end if;
  if exists(select 1 from pg_attribute where attrelid=relation_id and attnum>0 and not attisdropped and attname~* '(^|_)(token|token_hash|password|secret|credential|cookie|private_key|access_key|refresh_token|api_key)(_|$)') then raise exception 'DA_FORBIDDEN'; end if;
  select coalesce(array_agg(a.attname order by k.ordinality),array[]::text[]) into primary_columns from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum where i.indrelid=relation_id and i.indisprimary;
  select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'default',pg_get_expr(d.adbin,d.adrelid),'nullable',not a.attnotnull,
    'writable',p_table<>'jan_codes' and relation_kind in ('r','p') and cardinality(primary_columns)>0 and a.attgenerated='' and a.attidentity='' and a.attname not in ('created_at','updated_at') and not(a.attname=any(primary_columns)),
    'creatable',p_table<>'jan_codes' and relation_kind in ('r','p') and cardinality(primary_columns)>0 and a.attgenerated='' and a.attidentity='' and a.attname not in ('created_at','updated_at') and not(a.attname=any(primary_columns) and d.adbin is not null)) order by a.attnum),'[]'::jsonb) into fields
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=relation_id and a.attnum>0 and not a.attisdropped;
  return jsonb_build_object('table',p_table,'type',case when relation_kind in ('r','p') then 'table' else 'view' end,'primaryKey',to_jsonb(primary_columns),'fields',fields,'writable',p_table<>'jan_codes' and relation_kind in ('r','p') and cardinality(primary_columns)>0);
end $$;
