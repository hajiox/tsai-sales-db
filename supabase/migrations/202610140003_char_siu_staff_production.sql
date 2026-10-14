-- Dedicated DocScanner staff input. Existing production/cost snapshots are not changed.
create table if not exists public.char_siu_staff_connections (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 1 and 120),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  revoked_at timestamptz,
  expires_at timestamptz,
  allowed_device_ids text[],
  allowed_operator_names text[],
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.char_siu_staff_drafts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.char_siu_staff_connections(id),
  revision integer not null default 1 check (revision > 0),
  status text not null default 'draft' check (status in ('draft','needs_review','completed')),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  device_id text not null,
  operator_name text not null,
  scan_id uuid references public.char_siu_delivery_note_scans(id) on delete set null,
  pending_operation_id uuid,
  -- Historical UUID, deliberately without FK: existing manager deletion must not erase the draft.
  run_id uuid unique,
  submitted_at timestamptz,
  completed_at timestamptz,
  finalized_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (run_id is not null and completed_at is not null))
);

create table if not exists public.char_siu_staff_operations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.char_siu_staff_connections(id),
  client_operation_id uuid not null,
  action text not null check (action in ('saveDraft','submit','reservePhotos','finalize')),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  draft_id uuid not null references public.char_siu_staff_drafts(id),
  device_id text not null,
  operator_name text not null,
  draft_revision integer not null check (draft_revision > 0),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot)='object'),
  manager_actor text,
  state text not null check (state in ('processing','completed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (connection_id,client_operation_id),
  check ((state = 'completed') = (result is not null and completed_at is not null))
);

create table if not exists public.char_siu_staff_photos (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.char_siu_staff_drafts(id),
  operation_id uuid not null references public.char_siu_staff_operations(id),
  scan_id uuid not null references public.char_siu_delivery_note_scans(id),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 160),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  size_bytes integer not null check (size_bytes between 1 and 3145728),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  upload_order integer not null check (upload_order between 1 and 4),
  status text not null default 'processing' check (status in ('processing','needs_review','error')),
  created_at timestamptz not null default now()
);

create index if not exists char_siu_staff_drafts_connection_idx on public.char_siu_staff_drafts(connection_id,updated_at desc);
create index if not exists char_siu_staff_drafts_status_idx on public.char_siu_staff_drafts(status,updated_at desc);
create index if not exists char_siu_staff_drafts_scan_idx on public.char_siu_staff_drafts(scan_id) where scan_id is not null;
create index if not exists char_siu_staff_operations_draft_idx on public.char_siu_staff_operations(draft_id,created_at desc);
create index if not exists char_siu_staff_photos_draft_idx on public.char_siu_staff_photos(draft_id,created_at);
create index if not exists char_siu_staff_photos_operation_idx on public.char_siu_staff_photos(operation_id);
create index if not exists char_siu_staff_photos_scan_idx on public.char_siu_staff_photos(scan_id);

alter table public.char_siu_staff_connections enable row level security;
alter table public.char_siu_staff_drafts enable row level security;
alter table public.char_siu_staff_operations enable row level security;
alter table public.char_siu_staff_photos enable row level security;
revoke all on public.char_siu_staff_connections, public.char_siu_staff_drafts,
  public.char_siu_staff_operations, public.char_siu_staff_photos from public, anon, authenticated;
grant all on public.char_siu_staff_connections, public.char_siu_staff_drafts,
  public.char_siu_staff_operations, public.char_siu_staff_photos to service_role;

create or replace function public.char_siu_staff_assert_actor(p_connection_id uuid,p_device_id text,p_operator_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.char_siu_staff_connections%rowtype;
begin
  select * into c from public.char_siu_staff_connections where id=p_connection_id for share;
  if not found or not c.enabled or c.revoked_at is not null or (c.expires_at is not null and c.expires_at<=clock_timestamp()) then
    raise exception 'CSP_UNAUTHORIZED';
  end if;
  if p_device_id is null or p_device_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$'
    or p_operator_name is null or length(p_operator_name) not between 1 and 80
    or p_operator_name ~ '[[:cntrl:]]' or p_operator_name<>btrim(p_operator_name)
    or (c.allowed_device_ids is not null and not (p_device_id=any(c.allowed_device_ids)))
    or (c.allowed_operator_names is not null and not (p_operator_name=any(c.allowed_operator_names))) then
    raise exception 'CSP_FORBIDDEN';
  end if;
end;
$$;

create or replace function public.char_siu_staff_assert_input(p_input jsonb,p_complete boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb; r jsonb; production date; packaging date; n numeric; seen text[]; field text;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or pg_column_size(p_input)>65536 then raise exception 'CSP_INVALID_INPUT'; end if;
  for k in select jsonb_object_keys(p_input) loop
    if not (k=any(array['productionDate','packagingDate','cookingWorkerCount','cookingWorkHours','packagingWorkerCount','packagingWorkHours','materials','outputs','notes'])) then raise exception 'CSP_INVALID_INPUT'; end if;
  end loop;
  if jsonb_typeof(p_input->'productionDate') is distinct from 'string' or (p_input->>'productionDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'CSP_INVALID_INPUT'; end if;
  production := (p_input->>'productionDate')::date;
  if to_char(production,'YYYY-MM-DD')<>p_input->>'productionDate' then raise exception 'CSP_INVALID_INPUT'; end if;
  if p_input->'packagingDate' is not null and p_input->'packagingDate'<>'null'::jsonb then
    if jsonb_typeof(p_input->'packagingDate')<>'string' or (p_input->>'packagingDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'CSP_INVALID_INPUT'; end if;
    packaging := (p_input->>'packagingDate')::date;
    if to_char(packaging,'YYYY-MM-DD')<>p_input->>'packagingDate' or packaging<production then raise exception 'CSP_INVALID_INPUT'; end if;
  end if;
  foreach k in array array['cookingWorkerCount','cookingWorkHours','packagingWorkerCount','packagingWorkHours'] loop
    v:=p_input->k;
    if v is not null and v<>'null'::jsonb then
      if jsonb_typeof(v)<>'number' then raise exception 'CSP_INVALID_INPUT'; end if;
      n:=(v#>>'{}')::numeric;
      if n<=0 or n>'10000'::numeric or (k like '%WorkerCount' and (n<>trunc(n) or n>1000)) then raise exception 'CSP_INVALID_INPUT'; end if;
    elsif p_complete then raise exception 'CSP_NOT_READY'; end if;
  end loop;
  foreach k in array array['materials','outputs'] loop
    v:=p_input->k; field:=case k when 'materials' then 'usageAmount' else 'quantity' end;
    if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)<>(case k when 'materials' then 7 else 8 end) then raise exception 'CSP_INVALID_INPUT'; end if;
    seen:=array[]::text[];
    for r in select value from jsonb_array_elements(v) loop
      if jsonb_typeof(r)<>'object' or jsonb_typeof(r->'key') is distinct from 'string'
        or exists(select 1 from jsonb_object_keys(r) x where x<>all(array['key',field]))
        or r->>'key'=any(seen) then raise exception 'CSP_INVALID_INPUT'; end if;
      if (k='materials' and not (r->>'key'=any(array['pork_belly','green_onion','ginger','soy_sauce','sake','haimi','granulated_sugar'])))
        or (k='outputs' and not (r->>'key'=any(array['chashu_wakeari_800','chashu_slice_700','retort_thick_600','retort_medium_380','retort_cut_600','block','lard','minced_chashu']))) then raise exception 'CSP_INVALID_INPUT'; end if;
      seen:=array_append(seen,r->>'key');
      if r->field is not null and r->field<>'null'::jsonb then
        if jsonb_typeof(r->field)<>'number' then raise exception 'CSP_INVALID_INPUT'; end if;
        n:=(r->>field)::numeric;
        if n<0 or n>1000000000 or (k='outputs' and n<>trunc(n)) then raise exception 'CSP_INVALID_INPUT'; end if;
      end if;
    end loop;
  end loop;
  if p_input->'notes' is not null and (jsonb_typeof(p_input->'notes')<>'string' or length(p_input->>'notes')>2000) then raise exception 'CSP_INVALID_INPUT'; end if;
  if p_complete and (packaging is null
    or not exists(select 1 from jsonb_array_elements(p_input->'materials') x where coalesce((x->>'usageAmount')::numeric,0)>0)
    or not exists(select 1 from jsonb_array_elements(p_input->'outputs') x where coalesce((x->>'quantity')::numeric,0)>0)) then raise exception 'CSP_NOT_READY'; end if;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'CSP_INVALID_INPUT';
end;
$$;

-- Results remain server-internal; API DTOs explicitly omit paths, hashes and scan contents.
create or replace function public.char_siu_staff_result(p_draft_id uuid,p_operation_id uuid,p_replay boolean,p_processing boolean,p_claimed boolean)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('replay',p_replay,'processing',p_processing,'claimed',p_claimed,
    'operationId',p_operation_id,'scanId',d.scan_id,'draft',to_jsonb(d),
    'photos',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at,p.id) from public.char_siu_staff_photos p where p.draft_id=d.id),'[]'::jsonb))
  from public.char_siu_staff_drafts d where d.id=p_draft_id;
$$;

create or replace function public.char_siu_staff_apply(
  p_connection_id uuid,p_device_id text,p_operator_name text,p_action text,p_client_operation_id uuid,
  p_expected_revision integer,p_draft_id uuid,p_request_hash text,p_input jsonb,p_photos jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.char_siu_staff_drafts%rowtype; o public.char_siu_staff_operations%rowtype;
  op_id uuid:=gen_random_uuid(); scan uuid; v_result jsonb; photo jsonb; photo_index integer:=0; total_size bigint:=0; ext text;
begin
  perform public.char_siu_staff_assert_actor(p_connection_id,p_device_id,p_operator_name);
  if p_action is null or p_action<>all(array['saveDraft','submit','reservePhotos']) or p_client_operation_id is null
    or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>2147483646
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then raise exception 'CSP_INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_connection_id::text||':'||p_client_operation_id::text,0));
  select * into o from public.char_siu_staff_operations where connection_id=p_connection_id and client_operation_id=p_client_operation_id for update;
  if found then
    if o.action<>p_action or o.request_hash<>p_request_hash or (p_draft_id is not null and o.draft_id<>p_draft_id) then raise exception 'CSP_IDEMPOTENCY_CONFLICT'; end if;
    if o.state='completed' then return o.result||jsonb_build_object('replay',true,'claimed',false); end if;
    return public.char_siu_staff_result(o.draft_id,o.id,true,true,false);
  end if;
  if p_action='saveDraft' then perform public.char_siu_staff_assert_input(p_input,false);
  elsif p_input is not null then raise exception 'CSP_INVALID_INPUT'; end if;
  if p_draft_id is null then
    if p_action<>'saveDraft' or p_expected_revision<>0 then raise exception 'CSP_INVALID_INPUT'; end if;
    insert into public.char_siu_staff_drafts(connection_id,input,device_id,operator_name)
      values(p_connection_id,p_input,p_device_id,p_operator_name) returning * into d;
  else
    select * into d from public.char_siu_staff_drafts where id=p_draft_id and connection_id=p_connection_id for update;
    if not found then raise exception 'CSP_NOT_FOUND'; end if;
    if d.status='completed' then raise exception 'CSP_COMPLETED'; end if;
    if d.pending_operation_id is not null then raise exception 'CSP_IN_PROGRESS'; end if;
    if d.revision<>p_expected_revision then raise exception 'CSP_REVISION_CONFLICT'; end if;
    if p_action='submit' then perform public.char_siu_staff_assert_input(d.input,true); end if;
    update public.char_siu_staff_drafts set revision=revision+1,
      input=case when p_action='saveDraft' then p_input else input end,
      status=case when p_action='submit' then 'needs_review' else 'draft' end,
      submitted_at=case when p_action='submit' then clock_timestamp() else null end,
      device_id=p_device_id,operator_name=p_operator_name,updated_at=clock_timestamp()
      where id=d.id returning * into d;
  end if;
  insert into public.char_siu_staff_operations(id,connection_id,client_operation_id,action,request_hash,draft_id,device_id,operator_name,draft_revision,input_snapshot,state)
    values(op_id,p_connection_id,p_client_operation_id,p_action,p_request_hash,d.id,p_device_id,p_operator_name,d.revision,d.input,'processing');
  if p_action='reservePhotos' then
    if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 4 then raise exception 'CSP_INVALID_INPUT'; end if;
    for photo in select value from jsonb_array_elements(p_photos) loop
      if jsonb_typeof(photo)<>'object' or exists(select 1 from jsonb_object_keys(photo) k where k<>all(array['fileName','mimeType','size','sha256']))
        or jsonb_typeof(photo->'fileName') is distinct from 'string' or length(photo->>'fileName') not between 1 and 160
        or photo->>'fileName' ~ '[[:cntrl:]]' or jsonb_typeof(photo->'mimeType') is distinct from 'string'
        or photo->>'mimeType'<>all(array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
        or jsonb_typeof(photo->'size') is distinct from 'number' or (photo->>'size')::numeric<>trunc((photo->>'size')::numeric)
        or (photo->>'size')::numeric not between 1 and 3145728 or photo->>'sha256' is null or photo->>'sha256' !~ '^[a-f0-9]{64}$' then raise exception 'CSP_INVALID_INPUT'; end if;
      total_size:=total_size+(photo->>'size')::bigint;
    end loop;
    if total_size>3145728 then raise exception 'CSP_INVALID_INPUT'; end if;
    insert into public.char_siu_delivery_note_scans(status,source_kind,target_production_date,file_names,created_by)
      values('processing','doc_scanner',(d.input->>'productionDate')::date,
        array(select x->>'fileName' from jsonb_array_elements(p_photos) x),p_operator_name) returning id into scan;
    for photo in select value from jsonb_array_elements(p_photos) loop
      photo_index:=photo_index+1;
      ext:=case photo->>'mimeType' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' else 'heif' end;
      insert into public.char_siu_staff_photos(draft_id,operation_id,scan_id,storage_path,file_name,mime_type,size_bytes,sha256,upload_order)
        values(d.id,op_id,scan,p_connection_id::text||'/'||d.id::text||'/'||p_client_operation_id::text||'/'||photo_index::text||'-'||(photo->>'sha256')||'.'||ext,
          photo->>'fileName',photo->>'mimeType',(photo->>'size')::integer,photo->>'sha256',photo_index);
    end loop;
    update public.char_siu_staff_drafts set scan_id=scan,pending_operation_id=op_id where id=d.id;
    return public.char_siu_staff_result(d.id,op_id,false,true,true)||jsonb_build_object('photos',
      (select jsonb_agg(to_jsonb(p) order by p.upload_order) from public.char_siu_staff_photos p where p.operation_id=op_id));
  end if;
  v_result:=public.char_siu_staff_result(d.id,op_id,false,false,true);
  update public.char_siu_staff_operations set state='completed',result=v_result,completed_at=clock_timestamp() where id=op_id;
  return v_result;
end;
$$;

create or replace function public.char_siu_staff_finish_photos(
  p_connection_id uuid,p_device_id text,p_operator_name text,p_operation_id uuid,p_expected_revision integer,
  p_scan_id uuid,p_extracted_items jsonb,p_document_date date,p_error_code text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.char_siu_staff_drafts%rowtype; o public.char_siu_staff_operations%rowtype; v_result jsonb;
begin
  perform public.char_siu_staff_assert_actor(p_connection_id,p_device_id,p_operator_name);
  select * into o from public.char_siu_staff_operations where id=p_operation_id and connection_id=p_connection_id for update;
  if not found then raise exception 'CSP_NOT_FOUND'; end if;
  if o.action<>'reservePhotos' then raise exception 'CSP_INVALID_INPUT'; end if;
  if o.state='completed' then return o.result||jsonb_build_object('replay',true,'claimed',false); end if;
  select * into d from public.char_siu_staff_drafts where id=o.draft_id and connection_id=p_connection_id for update;
  if not found then raise exception 'CSP_NOT_FOUND'; end if;
  if d.pending_operation_id is distinct from o.id or d.revision is distinct from p_expected_revision or d.scan_id is distinct from p_scan_id then raise exception 'CSP_REVISION_CONFLICT'; end if;
  if p_extracted_items is null or jsonb_typeof(p_extracted_items)<>'array' or pg_column_size(p_extracted_items)>131072
    or (p_error_code is not null and p_error_code<>all(array['UPLOAD_FAILED','AI_REVIEW_REQUIRED'])) then raise exception 'CSP_INVALID_INPUT'; end if;
  perform 1 from public.char_siu_delivery_note_scans where id=p_scan_id and status='processing' and used_run_id is null for update;
  if not found then raise exception 'CSP_NOT_READY'; end if;
  update public.char_siu_delivery_note_scans set status=case when p_error_code='UPLOAD_FAILED' then 'error' else 'needs_review' end,
    extracted_items=p_extracted_items,document_date=p_document_date,
    error_message=case when p_error_code is null then null when p_error_code='UPLOAD_FAILED' then '製造写真の保存を確認してください' else '製造写真の読取内容を確認してください' end
    where id=p_scan_id;
  update public.char_siu_staff_photos set status=case when p_error_code='UPLOAD_FAILED' then 'error' else 'needs_review' end where operation_id=o.id;
  update public.char_siu_staff_drafts set pending_operation_id=null,revision=revision+1,status='draft',submitted_at=null,updated_at=clock_timestamp() where id=d.id;
  v_result:=public.char_siu_staff_result(d.id,o.id,false,false,true);
  if p_error_code='UPLOAD_FAILED' then v_result:=v_result||jsonb_build_object('errorCode','UPLOAD_FAILED'); end if;
  update public.char_siu_staff_operations set state='completed',result=v_result,completed_at=clock_timestamp(),
    draft_revision=(select revision from public.char_siu_staff_drafts where id=d.id),input_snapshot=d.input where id=o.id;
  return v_result;
end;
$$;

create or replace function public.char_siu_staff_finalize(
  p_draft_id uuid,p_expected_revision integer,p_client_operation_id uuid,p_request_hash text,p_manager_actor text,
  p_scan_id uuid,p_scan_updated_at timestamptz,p_scan_extracted_items jsonb,p_run jsonb,p_materials jsonb,p_outputs jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.char_siu_staff_drafts%rowtype; o public.char_siu_staff_operations%rowtype; s public.char_siu_delivery_note_scans%rowtype;
  run public.char_siu_production_runs%rowtype; op_id uuid:=gen_random_uuid(); v_result jsonb;
begin
  select * into d from public.char_siu_staff_drafts where id=p_draft_id;
  if not found then raise exception 'CSP_NOT_FOUND'; end if;
  if p_client_operation_id is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_manager_actor is null or length(p_manager_actor) not between 1 and 200 or p_expected_revision is null then raise exception 'CSP_INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.connection_id::text||':'||p_client_operation_id::text,0));
  select * into o from public.char_siu_staff_operations where connection_id=d.connection_id and client_operation_id=p_client_operation_id for update;
  if found then
    if o.action<>'finalize' or o.request_hash<>p_request_hash or o.draft_id<>p_draft_id then raise exception 'CSP_IDEMPOTENCY_CONFLICT'; end if;
    if o.state='completed' then return o.result||jsonb_build_object('replay',true,'claimed',false); end if;
    raise exception 'CSP_IN_PROGRESS';
  end if;
  select * into d from public.char_siu_staff_drafts where id=p_draft_id for update;
  if d.status='completed' then raise exception 'CSP_COMPLETED'; end if;
  if d.pending_operation_id is not null then raise exception 'CSP_IN_PROGRESS'; end if;
  if d.revision<>p_expected_revision then raise exception 'CSP_REVISION_CONFLICT'; end if;
  if d.status<>'needs_review' then raise exception 'CSP_NOT_READY'; end if;
  perform public.char_siu_staff_assert_input(d.input,true);
  select * into s from public.char_siu_delivery_note_scans where id=p_scan_id for update;
  if not found or s.status<>'ready' or s.used_run_id is not null or s.reviewed_at is null
    or s.target_production_date is distinct from (d.input->>'productionDate')::date
    or s.updated_at is distinct from p_scan_updated_at or s.extracted_items is distinct from p_scan_extracted_items then raise exception 'CSP_NOT_READY'; end if;
  if jsonb_typeof(p_run) is distinct from 'object' or jsonb_typeof(p_materials) is distinct from 'array' or jsonb_typeof(p_outputs) is distinct from 'array'
    or jsonb_array_length(p_materials)<>7 or jsonb_array_length(p_outputs)<>8 then raise exception 'CSP_INVALID_INPUT'; end if;
  select * into run from jsonb_populate_record(null::public.char_siu_production_runs,p_run);
  if run.id is null or run.production_date is distinct from (d.input->>'productionDate')::date
    or run.packaging_date is distinct from (d.input->>'packagingDate')::date
    or run.cooking_worker_count is distinct from (d.input->>'cookingWorkerCount')::integer
    or run.cooking_work_hours is distinct from (d.input->>'cookingWorkHours')::numeric
    or run.packaging_worker_count is distinct from (d.input->>'packagingWorkerCount')::integer
    or run.packaging_work_hours is distinct from (d.input->>'packagingWorkHours')::numeric
    or run.worker_count is distinct from run.cooking_worker_count
    or (p_run->>'work_hours')::numeric is distinct from run.cooking_work_hours
    or run.work_hours is distinct from round(run.cooking_work_hours,2)
    or run.notes is distinct from coalesce(d.input->>'notes','') then raise exception 'CSP_INVALID_INPUT'; end if;
  if (select count(distinct x->>'material_key') from jsonb_array_elements(p_materials) x)<>7
    or exists(select 1 from jsonb_array_elements(p_materials) x where (x->>'run_id')::uuid is distinct from run.id
      or not exists(select 1 from jsonb_array_elements(d.input->'materials') v where v->>'key'=x->>'material_key' and coalesce((v->>'usageAmount')::numeric,0)=(x->>'usage_amount')::numeric))
    or (select count(distinct x->>'output_key') from jsonb_array_elements(p_outputs) x)<>8
    or exists(select 1 from jsonb_array_elements(p_outputs) x where (x->>'run_id')::uuid is distinct from run.id
      or not exists(select 1 from jsonb_array_elements(d.input->'outputs') v where v->>'key'=x->>'output_key' and coalesce((v->>'quantity')::integer,0)=(x->>'quantity')::integer)) then raise exception 'CSP_INVALID_INPUT'; end if;
  insert into public.char_siu_staff_operations(id,connection_id,client_operation_id,action,request_hash,draft_id,device_id,operator_name,draft_revision,input_snapshot,manager_actor,state)
    values(op_id,d.connection_id,p_client_operation_id,'finalize',p_request_hash,d.id,d.device_id,d.operator_name,d.revision+1,d.input,p_manager_actor,'processing');
  insert into public.char_siu_production_runs(id,production_date,packaging_date,worker_count,work_hours,cooking_worker_count,cooking_work_hours,
    packaging_worker_count,packaging_work_hours,hourly_wage,total_person_hours,material_cost,labor_cost,total_cost,total_output_quantity,total_output_weight_g,
    average_cost_per_item,average_cost_per_kg,notes,created_by,labor_rate_staff_count,labor_rate_excluded_count,labor_rate_source,labor_rate_synced_at)
  values(run.id,run.production_date,run.packaging_date,run.worker_count,run.work_hours,run.cooking_worker_count,run.cooking_work_hours,
    run.packaging_worker_count,run.packaging_work_hours,run.hourly_wage,run.total_person_hours,run.material_cost,run.labor_cost,run.total_cost,run.total_output_quantity,run.total_output_weight_g,
    run.average_cost_per_item,run.average_cost_per_kg,run.notes,p_manager_actor,run.labor_rate_staff_count,run.labor_rate_excluded_count,run.labor_rate_source,run.labor_rate_synced_at);
  insert into public.char_siu_production_materials(run_id,material_key,ingredient_id,material_name,usage_amount,usage_unit,purchase_unit_quantity,purchase_price_tax_included,unit_cost,material_cost,sort_order,price_source,source_reference,source_confidence,source_note)
  select run_id,material_key,ingredient_id,material_name,usage_amount,usage_unit,purchase_unit_quantity,purchase_price_tax_included,unit_cost,material_cost,sort_order,price_source,source_reference,source_confidence,source_note
    from jsonb_populate_recordset(null::public.char_siu_production_materials,p_materials);
  insert into public.char_siu_production_outputs(run_id,output_key,recipe_id,output_name,quantity,unit_weight_g,output_weight_g,allocation_ratio,allocated_cost,unit_cost,sort_order)
  select run_id,output_key,recipe_id,output_name,quantity,unit_weight_g,output_weight_g,allocation_ratio,allocated_cost,unit_cost,sort_order
    from jsonb_populate_recordset(null::public.char_siu_production_outputs,p_outputs);
  update public.char_siu_delivery_note_scans set status='used',used_run_id=run.id where id=s.id;
  update public.char_siu_staff_drafts set status='completed',run_id=run.id,completed_at=clock_timestamp(),finalized_by=p_manager_actor,
    revision=revision+1,updated_at=clock_timestamp() where id=d.id;
  v_result:=public.char_siu_staff_result(d.id,op_id,false,false,true);
  update public.char_siu_staff_operations set state='completed',result=v_result,completed_at=clock_timestamp() where id=op_id;
  return v_result;
end;
$$;

revoke all on function public.char_siu_staff_assert_actor(uuid,text,text), public.char_siu_staff_assert_input(jsonb,boolean),
  public.char_siu_staff_result(uuid,uuid,boolean,boolean,boolean), public.char_siu_staff_apply(uuid,text,text,text,uuid,integer,uuid,text,jsonb,jsonb),
  public.char_siu_staff_finish_photos(uuid,text,text,uuid,integer,uuid,jsonb,date,text),
  public.char_siu_staff_finalize(uuid,integer,uuid,text,text,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.char_siu_staff_assert_actor(uuid,text,text), public.char_siu_staff_assert_input(jsonb,boolean),
  public.char_siu_staff_result(uuid,uuid,boolean,boolean,boolean), public.char_siu_staff_apply(uuid,text,text,text,uuid,integer,uuid,text,jsonb,jsonb),
  public.char_siu_staff_finish_photos(uuid,text,text,uuid,integer,uuid,jsonb,date,text),
  public.char_siu_staff_finalize(uuid,integer,uuid,text,text,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('char-siu-production-photos','char-siu-production-photos',false,3145728,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do nothing;

-- Never silently accept an older bucket with public access or wider upload types.
do $$
begin
  if not exists(select 1 from storage.buckets where id='char-siu-production-photos' and public=false
    and file_size_limit=3145728
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]) then
    raise exception 'CSP_BUCKET_CONFIG_CONFLICT';
  end if;
end;
$$;
