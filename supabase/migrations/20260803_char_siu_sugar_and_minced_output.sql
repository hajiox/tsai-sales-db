-- Add granulated sugar material and minced char siu output without changing past snapshots.

alter table public.char_siu_production_settings
  add column if not exists minced_chashu_unit_weight_g numeric(12, 2) not null default 1000
    check (minced_chashu_unit_weight_g > 0);

alter table public.char_siu_production_materials
  drop constraint if exists char_siu_production_materials_material_key_check;

alter table public.char_siu_production_materials
  add constraint char_siu_production_materials_material_key_check
    check (material_key in ('pork_belly', 'green_onion', 'ginger', 'soy_sauce', 'sake', 'haimi', 'granulated_sugar'));

alter table public.char_siu_production_outputs
  drop constraint if exists char_siu_production_outputs_output_key_check;

alter table public.char_siu_production_outputs
  add constraint char_siu_production_outputs_output_key_check
    check (output_key in ('chashu_wakeari_800', 'chashu_slice_700', 'retort_thick_600', 'retort_medium_380', 'retort_cut_600', 'block', 'lard', 'minced_chashu'));
