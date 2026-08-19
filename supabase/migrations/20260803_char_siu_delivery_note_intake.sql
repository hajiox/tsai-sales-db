-- Delivery-note intake workflow for QR capture and DocScanner imports.

alter table public.char_siu_delivery_note_scans
  add column if not exists source_kind text not null default 'direct_upload'
    check (source_kind in ('direct_upload', 'mobile_qr', 'doc_scanner')),
  add column if not exists target_production_date date,
  add column if not exists doc_scanner_doc_id text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

create index if not exists char_siu_delivery_note_scans_target_date_idx
  on public.char_siu_delivery_note_scans(target_production_date, created_at desc)
  where used_run_id is null;

create unique index if not exists char_siu_delivery_note_scans_docscanner_target_uidx
  on public.char_siu_delivery_note_scans(doc_scanner_doc_id, target_production_date)
  where doc_scanner_doc_id is not null;

comment on column public.char_siu_delivery_note_scans.target_production_date is
  'The production date selected by the operator when assigning this delivery note.';
comment on column public.char_siu_delivery_note_scans.doc_scanner_doc_id is
  'Source document ID received through the existing DocScanner-to-TSA material queue.';
