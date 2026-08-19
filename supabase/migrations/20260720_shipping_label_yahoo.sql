alter table public.shipping_label_mappings
  add column if not exists yahoo_item_id text,
  add column if not exists yahoo_name text not null default '';

alter table public.shipping_label_mappings
  alter column sku drop not null;

update public.shipping_label_mappings
set sku = null
where btrim(coalesce(sku, '')) = '';

update public.shipping_label_mappings
set yahoo_item_id = null
where btrim(coalesce(yahoo_item_id, '')) = '';

create unique index if not exists idx_shipping_label_mappings_yahoo_item_id
  on public.shipping_label_mappings (yahoo_item_id)
  where yahoo_item_id is not null;

create index if not exists idx_shipping_label_mappings_channel_codes
  on public.shipping_label_mappings (sku, yahoo_item_id);

comment on column public.shipping_label_mappings.sku is 'Amazon SKU. Yahoo-only mappings may be NULL.';
comment on column public.shipping_label_mappings.yahoo_item_id is 'Yahoo ItemId. Amazon-only mappings may be NULL.';
