begin;

alter table public.dining_items
  add column if not exists linked_recipe_id uuid
  references public.recipes(id) on delete set null;

comment on column public.dining_items.linked_recipe_id is
  '製造用レシピシステムの中間部品。総原価と実出来高を飲食用原価へ自動反映する。';

create index if not exists dining_items_linked_recipe_idx
  on public.dining_items(linked_recipe_id)
  where linked_recipe_id is not null;

create or replace function public.apply_linked_recipe_cost_to_dining_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_recipe public.recipes%rowtype;
  actual_weight numeric;
begin
  if new.linked_recipe_id is null then
    return new;
  end if;

  select *
  into source_recipe
  from public.recipes
  where id = new.linked_recipe_id
    and is_intermediate = true;

  if not found then
    raise exception '連動先の中間部品レシピが見つかりません: %', new.linked_recipe_id;
  end if;

  actual_weight := coalesce(source_recipe.total_weight, 0)
    * coalesce(source_recipe.yield_rate, 1);

  if actual_weight <= 0 then
    raise exception '連動先の出来高が0以下です: %', source_recipe.name;
  end if;

  new.purchase_quantity := actual_weight;
  new.yield_quantity := actual_weight;
  new.price_incl_tax := coalesce(source_recipe.total_cost, 0);
  new.unit := 'g';
  return new;
end;
$$;

drop trigger if exists dining_items_apply_linked_recipe_cost
  on public.dining_items;
create trigger dining_items_apply_linked_recipe_cost
before insert or update of linked_recipe_id, purchase_quantity, yield_quantity, price_incl_tax
on public.dining_items
for each row
execute function public.apply_linked_recipe_cost_to_dining_item();

create or replace function public.refresh_linked_dining_items_from_recipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dining_items
  set
    purchase_quantity = coalesce(new.total_weight, 0) * coalesce(new.yield_rate, 1),
    yield_quantity = coalesce(new.total_weight, 0) * coalesce(new.yield_rate, 1),
    price_incl_tax = coalesce(new.total_cost, 0),
    unit = 'g'
  where linked_recipe_id = new.id;
  return new;
end;
$$;

drop trigger if exists recipes_refresh_linked_dining_items
  on public.recipes;
create trigger recipes_refresh_linked_dining_items
after update of total_cost, total_weight, yield_rate
on public.recipes
for each row
when (
  old.total_cost is distinct from new.total_cost
  or old.total_weight is distinct from new.total_weight
  or old.yield_rate is distinct from new.yield_rate
)
execute function public.refresh_linked_dining_items_from_recipe();

update public.dining_items
set
  name = '煮干し油（容器なし）',
  linked_recipe_id = 'a7a26d26-0652-4e02-9cee-b4c24bdc8e0b',
  notes = '連動済み（2026-08-12）。出典: TSAレシピシステム／中間部品「【P】煮干し油」。サラダ油と煮干し片口だけで構成され、袋・ラベル・容器を含まない油の原価と出来高を自動反映。',
  source_file = 'TSAレシピシステム',
  source_sheet = '中間部品',
  source_reference = 'a7a26d26-0652-4e02-9cee-b4c24bdc8e0b／【P】煮干し油（容器なし）'
where id = 'd1000000-0000-4000-8000-000000000005';

update public.dining_items
set
  name = 'ネギ油（容器なし）',
  linked_recipe_id = '22ddac3a-4b4d-4d73-b9d0-1a149280ce3b',
  notes = '連動済み（2026-08-12）。出典: TSAレシピシステム／中間部品「【P】ネギ油」。サラダ油・生姜・ネギだけで構成され、袋・ラベル・容器を含まない油の原価と出来高を自動反映。',
  source_file = 'TSAレシピシステム',
  source_sheet = '中間部品',
  source_reference = '22ddac3a-4b4d-4d73-b9d0-1a149280ce3b／【P】ネギ油（容器なし）'
where id = 'd1000000-0000-4000-8000-000000000013';

commit;
