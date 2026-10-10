-- Run only after an authorized business row mutation, in that same transaction.
-- These helpers do not expose database/code access and do not publish to an EC.
create or replace function public.tsa_business_recipe_item_cost(p_item jsonb)
returns numeric
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $function$
  with values_in as (
    select coalesce(p_item->>'item_type', '') as kind,
      coalesce((p_item->>'usage_amount')::numeric, 0) as usage,
      coalesce((p_item->>'unit_price')::numeric, 0) as price,
      coalesce(nullif((p_item->>'unit_quantity')::numeric, 0), 1) as quantity,
      coalesce((p_item->>'unit_weight')::numeric, 0) as weight,
      (p_item->>'tax_included')::boolean is not false as tax_included
  ), amount as (
    select case
      when kind in ('intermediate', 'product') and quantity = -1 and weight > 0
        then usage / weight * price
      when kind in ('intermediate', 'product') then usage * price
      when kind in ('material', 'expense')
        then usage * price * case when tax_included then 1 else 1.10 end
      else usage * price / quantity * case when tax_included then 1 else 1.08 end
    end as value from values_in
  )
  -- Match Math.round, including the negative-half direction, at four decimals.
  select floor(value * 10000 + 0.5) / 10000 from amount;
$function$;

-- Store only fields changed by this helper, not descriptions/images/embeddings.
create or replace function public.tsa_business_cost_snapshot(p_table text, p_row jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $function$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(p_row)
  where key = any(case p_table
    when 'recipe_items' then array['id', 'recipe_id', 'item_name', 'item_type', 'ingredient_id', 'material_id', 'expense_id', 'intermediate_recipe_id', 'usage_amount', 'unit_quantity', 'unit_price', 'unit_weight', 'tax_included', 'cost']
    when 'recipes' then array['id', 'name', 'selling_price', 'total_cost', 'amazon_fee_enabled', 'linked_product_id', 'linked_wholesale_product_id', 'linked_oem_product_id']
    else array['id', 'price', 'profit_rate'] end);
$function$;

create or replace function public.tsa_business_sync_related(
  p_table text,
  p_before jsonb,
  p_after jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_row public.recipe_items%rowtype;
  v_recipe public.recipes%rowtype;
  v_next jsonb;
  v_previous jsonb;
  v_result jsonb;
  v_key text;
  v_id uuid;
  v_recipe_ids uuid[] := array[]::uuid[];
  v_recipe_id uuid;
  v_master_column text;
  v_price_column text;
  v_kind text;
  v_source jsonb;
  v_source_changed boolean;
  v_name_changed boolean;
  v_cost_changed boolean;
  v_recalculate boolean := false;
  v_link_changed boolean := false;
  v_price numeric;
  v_quantity numeric;
  v_tax boolean;
  v_cost numeric;
  v_total numeric;
  v_web_price numeric;
  v_wholesale_price numeric;
  v_link_table text;
  v_link_id uuid;
  v_link_price numeric;
  v_profit numeric;
  v_link record;
begin
  p_before := nullif(p_before, 'null'::jsonb);
  p_after := nullif(p_after, 'null'::jsonb);
  -- This is an internal fixed-table helper, not a generic SQL/write gateway.
  if p_table not in ('recipes', 'recipe_items', 'ingredients', 'materials', 'expenses') then
    return jsonb_build_object('before', v_before, 'after', v_after);
  end if;
  v_id := coalesce(p_after->>'id', p_before->>'id')::uuid;
  if v_id is null then
    raise exception 'DA_INVALID_INPUT';
  end if;

  if p_table in ('ingredients', 'materials', 'expenses') then
    -- Deletes preserve existing snapshots (or fail on the existing foreign key).
    -- Newly created masters have no references to normalize.
    if p_after is null or p_before is null then
      return jsonb_build_object('before', v_before, 'after', v_after);
    end if;
    v_kind := case p_table when 'ingredients' then 'ingredient' when 'materials' then 'material' else 'expense' end;
    v_master_column := v_kind || '_id';
    v_name_changed := p_before->'name' is distinct from p_after->'name';
    v_price_column := case when p_table = 'expenses' then 'unit_price' else 'price' end;
    v_cost_changed := p_before->v_price_column is distinct from p_after->v_price_column
      or p_before->'unit_quantity' is distinct from p_after->'unit_quantity'
      or p_before->'tax_included' is distinct from p_after->'tax_included';
    if not v_name_changed and not v_cost_changed then
      return jsonb_build_object('before', v_before, 'after', v_after);
    end if;
    v_price := coalesce((p_after->>v_price_column)::numeric, 0);
    -- A material's unit_quantity is descriptive text, never a cost divisor.
    v_quantity := case when p_table = 'ingredients'
      then coalesce(nullif((p_after->>'unit_quantity')::numeric, 0), 1) else 1 end;
    v_tax := (p_after->>'tax_included')::boolean is not false;

    for v_row in execute format(
      'select * from public.recipe_items where %I = $1 order by id for update', v_master_column
    ) using v_id loop
      v_previous := to_jsonb(v_row);
      v_next := v_previous;
      if v_name_changed then v_next := v_next || jsonb_build_object('item_name', p_after->>'name'); end if;
      if v_cost_changed then
        v_next := v_next || jsonb_build_object('unit_price', v_price, 'tax_included', v_tax);
        if p_table = 'ingredients' then
          v_next := v_next || jsonb_build_object('unit_quantity', v_quantity);
        end if;
        -- The master kind determines its cost formula, matching the UI helper.
        v_cost := public.tsa_business_recipe_item_cost(v_next || jsonb_build_object('item_type', v_kind));
        v_next := v_next || jsonb_build_object('cost', v_cost);
      end if;
      if v_next is distinct from v_previous then
        v_key := 'recipe_items:' || v_row.id::text;
        v_before := v_before || jsonb_build_object(v_key, public.tsa_business_cost_snapshot('recipe_items', v_previous));
        update public.recipe_items set
          item_name = v_next->>'item_name',
          unit_price = (v_next->>'unit_price')::numeric,
          unit_quantity = (v_next->>'unit_quantity')::numeric,
          tax_included = (v_next->>'tax_included')::boolean,
          cost = (v_next->>'cost')::numeric
        where id = v_row.id
        returning to_jsonb(recipe_items) into v_result;
        v_after := v_after || jsonb_build_object(v_key, public.tsa_business_cost_snapshot('recipe_items', v_result));
        if v_row.recipe_id is not null and (
          v_cost_changed or (v_name_changed and (v_row.item_name = 'Amazon手数料' or p_after->>'name' = 'Amazon手数料'))
        ) then v_recipe_ids := array_append(v_recipe_ids, v_row.recipe_id); end if;
      end if;
    end loop;
  elsif p_table = 'recipe_items' then
    if p_after is not null then
      select * into v_row from public.recipe_items where id = v_id for update;
      if found then
        v_previous := to_jsonb(v_row);
        v_next := v_previous;
        v_master_column := case v_row.item_type when 'ingredient' then 'ingredient_id'
          when 'material' then 'material_id' when 'expense' then 'expense_id'
          when 'intermediate' then 'intermediate_recipe_id' when 'product' then 'intermediate_recipe_id' end;
        v_source_changed := v_master_column is not null and p_after->>v_master_column is not null and (
          p_before is null or p_before->v_master_column is distinct from p_after->v_master_column
          or p_before->'item_type' is distinct from p_after->'item_type'
        );
        if v_source_changed then
          -- Selecting a different source refreshes its snapshots, as in the UI.
          -- Preserve explicit simultaneous edits; on create fill only nulls.
          v_source := null;
          if v_row.item_type = 'ingredient' then
            select to_jsonb(i) into v_source from public.ingredients i where id = v_row.ingredient_id for share;
          elsif v_row.item_type = 'material' then
            select to_jsonb(m) into v_source from public.materials m where id = v_row.material_id for share;
          elsif v_row.item_type = 'expense' then
            select to_jsonb(e) into v_source from public.expenses e where id = v_row.expense_id for share;
          else
            select to_jsonb(r) into v_source from public.recipes r where id = v_row.intermediate_recipe_id for share;
          end if;
          if v_source is not null then
            v_price := coalesce((v_source->>case v_row.item_type when 'expense' then 'unit_price'
              when 'intermediate' then 'total_cost' when 'product' then 'total_cost' else 'price' end)::numeric, 0);
            v_quantity := case when v_row.item_type = 'ingredient'
              then coalesce(nullif((v_source->>'unit_quantity')::numeric, 0), 1) else 1 end;
            v_tax := (v_source->>'tax_included')::boolean is not false;
            if (p_before is null and coalesce(p_after->>'item_name', '') = '')
                or (p_before is not null and p_before->'item_name' is not distinct from p_after->'item_name') then
              v_next := v_next || jsonb_build_object('item_name', v_source->>'name');
            end if;
            if (p_before is null and p_after->>'unit_price' is null)
                or (p_before is not null and p_before->'unit_price' is not distinct from p_after->'unit_price') then
              v_next := v_next || jsonb_build_object('unit_price', v_price);
            end if;
            if (p_before is null and p_after->>'unit_quantity' is null)
                or (p_before is not null and p_before->'unit_quantity' is not distinct from p_after->'unit_quantity') then
              v_next := v_next || jsonb_build_object('unit_quantity', v_quantity);
            end if;
            if (p_before is null and p_after->>'tax_included' is null)
                or (p_before is not null and p_before->'tax_included' is not distinct from p_after->'tax_included') then
              v_next := v_next || jsonb_build_object('tax_included', v_tax);
            end if;
            if v_row.item_type in ('intermediate', 'product') and (
                (p_before is null and p_after->>'unit_weight' is null)
                or (p_before is not null and p_before->'unit_weight' is not distinct from p_after->'unit_weight')) then
              v_next := v_next || jsonb_build_object('unit_weight', coalesce((v_source->>'total_weight')::numeric, 0));
            end if;
          end if;
        end if;
        -- Recompute only when a cost input changes, never for a notes-only edit.
        v_cost_changed := v_source_changed or p_before is null or exists (
          select 1 from unnest(array['item_type', 'usage_amount', 'unit_price', 'unit_quantity', 'unit_weight', 'tax_included', 'cost']) as changed(field)
          where p_before->changed.field is distinct from p_after->changed.field
        );
        if v_cost_changed then
          v_next := v_next || jsonb_build_object('cost', public.tsa_business_recipe_item_cost(v_next));
        end if;
        if v_next is distinct from v_previous then
          v_key := 'recipe_items:' || v_row.id::text;
          v_before := v_before || jsonb_build_object(v_key, public.tsa_business_cost_snapshot('recipe_items', v_previous));
          update public.recipe_items set item_name = v_next->>'item_name',
            unit_price = (v_next->>'unit_price')::numeric, unit_quantity = (v_next->>'unit_quantity')::numeric,
            unit_weight = (v_next->>'unit_weight')::numeric, tax_included = (v_next->>'tax_included')::boolean,
            cost = (v_next->>'cost')::numeric where id = v_row.id
            returning to_jsonb(recipe_items) into v_result;
          v_after := v_after || jsonb_build_object(v_key, public.tsa_business_cost_snapshot('recipe_items', v_result));
        end if;
      end if;
    end if;
    if p_before is null or p_after is null or exists (
      select 1 from unnest(array['recipe_id', 'cost', 'item_type', 'item_name', 'usage_amount', 'unit_price', 'unit_quantity', 'unit_weight', 'tax_included']) as changed(field)
      where p_before->changed.field is distinct from p_after->changed.field
    ) then
      if p_before->>'recipe_id' is not null then v_recipe_ids := array_append(v_recipe_ids, (p_before->>'recipe_id')::uuid); end if;
      if p_after->>'recipe_id' is not null then v_recipe_ids := array_append(v_recipe_ids, (p_after->>'recipe_id')::uuid); end if;
    end if;
  elsif p_table = 'recipes' and p_after is not null then
    v_recalculate := p_before is null or exists (
      select 1 from unnest(array['selling_price', 'amazon_fee_enabled', 'total_cost']) as changed(field)
      where p_before->changed.field is distinct from p_after->changed.field
    );
    v_link_changed := exists (
      select 1 from unnest(array['linked_product_id', 'linked_wholesale_product_id', 'linked_oem_product_id']) as changed(field)
      where p_before->changed.field is distinct from p_after->changed.field
    );
    if v_recalculate or v_link_changed then v_recipe_ids := array_append(v_recipe_ids, v_id); end if;
  end if;

  for v_recipe_id in select distinct id from unnest(v_recipe_ids) as affected(id) order by id loop
    select * into v_recipe from public.recipes where id = v_recipe_id for update;
    if not found then continue; end if;
    -- A link-only change copies prices without rewriting an unrelated cost.
    if p_table <> 'recipes' or v_recalculate then
      select coalesce(sum(coalesce(cost, 0)), 0) into v_total from public.recipe_items
      where recipe_id = v_recipe_id and not (item_type = 'expense' and item_name = 'Amazon手数料');
      if v_recipe.amazon_fee_enabled and coalesce(v_recipe.selling_price, 0) <> 0 then
        v_total := v_total + floor(floor(v_recipe.selling_price * 1.08) * 0.1 + 0.5);
      end if;
      v_total := floor(v_total * 10000 + 0.5) / 10000;
      if v_recipe.total_cost is distinct from v_total then
        v_key := 'recipes:' || v_recipe.id::text;
        v_before := v_before || jsonb_build_object(v_key, public.tsa_business_cost_snapshot('recipes', to_jsonb(v_recipe)));
        update public.recipes set total_cost = v_total where id = v_recipe.id
          returning * into v_recipe;
        v_after := v_after || jsonb_build_object(v_key, public.tsa_business_cost_snapshot('recipes', to_jsonb(v_recipe)));
      end if;
    end if;

    -- Match syncRecipeLinkedProductPrices: strictly positive selling prices only.
    -- Existing price-history and durable EC revision triggers remain enabled.
    if coalesce(v_recipe.selling_price, 0) <= 0 then continue; end if;
    v_web_price := floor(v_recipe.selling_price * 1.08);
    v_wholesale_price := floor(floor(v_recipe.selling_price * 0.7) * 1.08);
    for v_link in select * from (values
      ('products'::text, v_recipe.linked_product_id, v_web_price, true),
      ('wholesale_products'::text, v_recipe.linked_wholesale_product_id, v_wholesale_price, true),
      ('wholesale_products'::text, v_recipe.linked_oem_product_id, v_web_price, true),
      ('oem_products'::text, v_recipe.linked_oem_product_id, v_web_price, false)
    ) as links(table_name, id, price, has_profit) loop
      if v_link.id is null then continue; end if;
      v_link_table := v_link.table_name;
      v_link_id := v_link.id;
      v_link_price := v_link.price;
      execute format('select to_jsonb(p) from public.%I p where id = $1 for update', v_link_table)
        into v_previous using v_link_id;
      if v_previous is null then continue; end if;
      v_profit := case when coalesce(v_recipe.total_cost, 0) > 0 and v_link_price > 0
        then floor(((v_link_price - v_recipe.total_cost) / v_link_price) * 1000 + 0.5) / 10
        else null end;
      v_next := v_previous || jsonb_build_object('price', v_link_price);
      if v_link.has_profit then v_next := v_next || jsonb_build_object('profit_rate', v_profit); end if;
      if v_next is not distinct from v_previous then continue; end if;
      v_key := v_link_table || ':' || v_link_id::text;
      if not (v_before ? v_key) then v_before := v_before || jsonb_build_object(v_key, public.tsa_business_cost_snapshot(v_link_table, v_previous)); end if;
      if v_link.has_profit then
        execute format('update public.%I set price = $1, profit_rate = $2 where id = $3 returning to_jsonb(%I)', v_link_table, v_link_table)
          into v_result using v_link_price, v_profit, v_link_id;
      else
        execute format('update public.%I set price = $1 where id = $2 returning to_jsonb(%I)', v_link_table, v_link_table)
          into v_result using v_link_price, v_link_id;
      end if;
      v_after := v_after || jsonb_build_object(v_key, public.tsa_business_cost_snapshot(v_link_table, v_result));
    end loop;
  end loop;
  return jsonb_build_object('before', v_before, 'after', v_after);
end;
$function$;

revoke all on function public.tsa_business_recipe_item_cost(jsonb) from public, anon, authenticated;
revoke all on function public.tsa_business_cost_snapshot(text, jsonb) from public, anon, authenticated;
revoke all on function public.tsa_business_sync_related(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.tsa_business_recipe_item_cost(jsonb) to service_role;
grant execute on function public.tsa_business_cost_snapshot(text, jsonb) to service_role;
grant execute on function public.tsa_business_sync_related(text, jsonb, jsonb) to service_role;
