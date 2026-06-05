// DocScanner物販納品書 -> 卸販売管理 連携API
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set'); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set'); })()
);

type SyncItem = {
  lineId?: string | null;
  lineNumber?: number | null;
  productName: string;
  quantity: number;
  unit?: string | null;
  unitPrice?: number | null;
  amount?: number | null;
  sourceRecipeId?: string | null;
  janCode?: string | null;
  remarks?: string | null;
};

type SyncPayload = {
  delete?: boolean;
  deliveryNote: {
    id: string;
    number?: string | null;
    deliveryDate?: string | null;
    issueDate?: string | null;
    counterpartyId?: string | null;
    counterpartyName?: string | null;
    transactionType?: string | null;
    rate?: number | null;
    taxRate?: number | null;
    subtotal?: number | null;
    totalAmount?: number | null;
  };
  items?: SyncItem[];
};

type ProductRow = {
  id: string;
  product_code: string;
  product_name: string;
  price: number;
  is_active?: boolean | null;
};

type RecipeRow = {
  id: string;
  name: string;
  linked_wholesale_product_id: string | null;
};

type AggregateCombo = {
  productId: string;
  customerId: string;
  saleDate: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getProvidedSecret(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  return req.headers.get('x-tsa-sync-secret') || bearer || '';
}

function normalizeName(value: string | null | undefined) {
  return (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/株式会社|有限会社|\(株\)|（株）|\(有\)|（有）|合同会社|合資会社|合名会社/g, '')
    .replace(/御中|様/g, '')
    .replace(/[【】\[\]（）()「」『』〈〉<>]/g, '')
    .replace(/[・･\s_\-—–ー.,，、。/／:：]/g, '')
    .trim();
}

function isUuid(value: string | null | undefined) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toInteger(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function comboKey(combo: AggregateCombo) {
  return `${combo.productId}|${combo.customerId}|${combo.saleDate}`;
}

async function nextCustomerCode() {
  const { data } = await supabase
    .from('wholesale_customers')
    .select('customer_code')
    .like('customer_code', 'WH%')
    .order('customer_code', { ascending: false })
    .limit(50);

  let max = 0;
  for (const row of data || []) {
    const n = Number(String(row.customer_code || '').replace(/^WH/i, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `WH${String(max + 1).padStart(4, '0')}`;
}

async function nextProductCode(offset = 0) {
  const { data } = await supabase
    .from('wholesale_products')
    .select('product_code')
    .eq('product_type', '通常卸')
    .limit(1000);

  let max = 0;
  for (const row of data || []) {
    const match = String(row.product_code || '').trim().match(/^W?(\d{1,6})$/i);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `W${String(max + 1 + offset).padStart(3, '0')}`;
}

async function findOrCreateCustomer(note: SyncPayload['deliveryNote']) {
  const counterpartyId = note.counterpartyId || null;
  const counterpartyName = note.counterpartyName || '取引先不明';
  const normalized = normalizeName(counterpartyName);

  if (counterpartyId) {
    const { data } = await supabase
      .from('wholesale_customers')
      .select('*')
      .eq('doc_scanner_counterparty_id', counterpartyId)
      .maybeSingle();
    if (data) return data;
  }

  const { data: customers, error } = await supabase
    .from('wholesale_customers')
    .select('*');
  if (error) throw error;

  const matched = (customers || []).find((c: any) =>
    normalizeName(c.normalized_name || c.customer_name) === normalized
  );

  if (matched) {
    if (counterpartyId && !matched.doc_scanner_counterparty_id) {
      await supabase
        .from('wholesale_customers')
        .update({ doc_scanner_counterparty_id: counterpartyId, normalized_name: normalized })
        .eq('id', matched.id);
    }
    return matched;
  }

  const customerCode = await nextCustomerCode();
  const { data: created, error: createError } = await supabase
    .from('wholesale_customers')
    .insert({
      customer_code: customerCode,
      customer_name: counterpartyName,
      customer_type: '通常卸',
      is_active: true,
      doc_scanner_counterparty_id: counterpartyId,
      normalized_name: normalized,
    })
    .select('*')
    .single();
  if (createError) throw createError;
  return created;
}

async function loadProductContext(items: SyncItem[]) {
  const recipeIds = [...new Set(items.map(i => i.sourceRecipeId).filter(isUuid))] as string[];

  const [productsRes, linkedRecipesRes, sourceRecipesRes] = await Promise.all([
    supabase
      .from('wholesale_products')
      .select('id, product_code, product_name, price, is_active')
      .eq('product_type', '通常卸'),
    supabase
      .from('recipes')
      .select('id, name, linked_wholesale_product_id')
      .not('linked_wholesale_product_id', 'is', null),
    recipeIds.length
      ? supabase
        .from('recipes')
        .select('id, name, linked_wholesale_product_id')
        .in('id', recipeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (linkedRecipesRes.error) throw linkedRecipesRes.error;
  if (sourceRecipesRes.error) throw sourceRecipesRes.error;

  return {
    products: (productsRes.data || []) as ProductRow[],
    linkedRecipes: (linkedRecipesRes.data || []) as RecipeRow[],
    sourceRecipes: (sourceRecipesRes.data || []) as RecipeRow[],
  };
}

function scoreName(source: string, candidate: string) {
  const s = normalizeName(source);
  const c = normalizeName(candidate);
  if (!s || !c) return 0;
  if (s === c) return 1;
  if (s.includes(c) || c.includes(s)) {
    return Math.min(s.length, c.length) / Math.max(s.length, c.length);
  }
  return 0;
}

async function createWholesaleProduct(item: SyncItem, recipe?: RecipeRow | null) {
  const unitPrice = toInteger(item.unitPrice);
  const productName = recipe?.name || item.productName;

  let product: ProductRow | null = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const productCode = await nextProductCode(attempt);
    const { data, error } = await supabase
      .from('wholesale_products')
      .insert({
        product_code: productCode,
        product_name: productName,
        price: unitPrice,
        profit_rate: 0,
        product_type: '通常卸',
        is_active: true,
      })
      .select('id, product_code, product_name, price, is_active')
      .single();

    if (!error && data) {
      product = data as ProductRow;
      break;
    }

    lastError = error;
    if (error?.code !== '23505') break;
  }

  if (!product) throw lastError || new Error('卸商品の自動作成に失敗しました');

  if (recipe?.id) {
    await supabase
      .from('recipes')
      .update({ linked_wholesale_product_id: product.id })
      .eq('id', recipe.id)
      .is('linked_wholesale_product_id', null);
  }

  return product;
}

async function resolveProduct(
  item: SyncItem,
  context: { products: ProductRow[]; linkedRecipes: RecipeRow[]; sourceRecipes: RecipeRow[] }
) {
  const sourceRecipe = item.sourceRecipeId
    ? context.sourceRecipes.find(r => r.id === item.sourceRecipeId)
    : null;

  if (sourceRecipe?.linked_wholesale_product_id) {
    const product = context.products.find(p => p.id === sourceRecipe.linked_wholesale_product_id);
    if (product) return { product, match: 'source_recipe_link' };
  }

  const names = [item.productName, sourceRecipe?.name].filter(Boolean) as string[];
  let best: { product: ProductRow; score: number; match: string } | null = null;

  for (const name of names) {
    for (const product of context.products) {
      const score = scoreName(name, product.product_name);
      if (score > (best?.score || 0)) best = { product, score, match: 'product_name' };
    }
    for (const recipe of context.linkedRecipes) {
      const score = scoreName(name, recipe.name);
      if (score > (best?.score || 0) && recipe.linked_wholesale_product_id) {
        const product = context.products.find(p => p.id === recipe.linked_wholesale_product_id);
        if (product) best = { product, score, match: 'linked_recipe_name' };
      }
    }
  }

  if (best && best.score >= 0.72) return { product: best.product, match: best.match };

  const created = await createWholesaleProduct(item, sourceRecipe);
  context.products.push(created);
  return { product: created, match: 'created' };
}

async function rebuildAggregates(combos: AggregateCombo[]) {
  const unique = [...new Map(combos.map(c => [comboKey(c), c])).values()];
  const results = [];

  for (const combo of unique) {
    const { data: sourceRows, error } = await supabase
      .from('wholesale_delivery_note_sales')
      .select('quantity, unit_price, amount')
      .eq('product_id', combo.productId)
      .eq('wholesale_customer_id', combo.customerId)
      .eq('delivery_date', combo.saleDate);
    if (error) throw error;

    const quantity = toInteger((sourceRows || []).reduce((sum: number, r: any) => sum + Number(r.quantity || 0), 0));
    const amount = toInteger((sourceRows || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0));
    const unitPrice = quantity !== 0
      ? toInteger(amount / quantity)
      : toInteger(sourceRows?.[0]?.unit_price);

    const { data: existing, error: existingError } = await supabase
      .from('wholesale_sales')
      .select('id, source_type')
      .eq('product_id', combo.productId)
      .eq('customer_id', combo.customerId)
      .eq('sale_date', combo.saleDate)
      .maybeSingle();
    if (existingError) throw existingError;

    if (quantity === 0) {
      if (existing?.source_type === 'doc_scanner') {
        const { error: deleteError } = await supabase
          .from('wholesale_sales')
          .delete()
          .eq('id', existing.id);
        if (deleteError) throw deleteError;
      }
      results.push({ ...combo, quantity: 0, amount: 0, action: 'deleted' });
      continue;
    }

    const row = {
      product_id: combo.productId,
      customer_id: combo.customerId,
      sale_date: combo.saleDate,
      quantity,
      unit_price: unitPrice,
      amount,
      source_type: 'doc_scanner',
      source_ref: 'delivery_notes',
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error: updateError } = await supabase
        .from('wholesale_sales')
        .update(row)
        .eq('id', existing.id);
      if (updateError) throw updateError;
      results.push({ ...combo, quantity, amount, action: 'updated' });
    } else {
      const { error: insertError } = await supabase
        .from('wholesale_sales')
        .insert(row);
      if (insertError) throw insertError;
      results.push({ ...combo, quantity, amount, action: 'inserted' });
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.TSA_DELIVERY_SYNC_SECRET || process.env.PUSH_NOTIFY_SECRET;
    if (!secret) return jsonError('TSA sync secret is not configured', 500);
    if (getProvidedSecret(req) !== secret) return jsonError('Unauthorized', 401);

    const body = await req.json() as SyncPayload;
    const note = body.deliveryNote;
    if (!note?.id) return jsonError('deliveryNote.id is required');

    const deliveryDate = note.deliveryDate || note.issueDate;
    if (!deliveryDate) return jsonError('deliveryDate is required');
    const saleDate = deliveryDate.slice(0, 10);

    const { data: oldRows } = await supabase
      .from('wholesale_delivery_note_sales')
      .select('product_id, wholesale_customer_id, delivery_date')
      .eq('external_delivery_note_id', note.id);
    const oldCombos = (oldRows || []).map((r: any) => ({
      productId: r.product_id,
      customerId: r.wholesale_customer_id,
      saleDate: String(r.delivery_date).slice(0, 10),
    }));

    const { error: deleteSourceError } = await supabase
      .from('wholesale_delivery_note_sales')
      .delete()
      .eq('external_delivery_note_id', note.id);
    if (deleteSourceError) throw deleteSourceError;

    if (body.delete) {
      const rebuilt = await rebuildAggregates(oldCombos);
      return NextResponse.json({ success: true, deleted: true, rebuilt });
    }

    const items = (body.items || []).filter(i => i.productName && Number(i.quantity || 0) !== 0);
    if (items.length === 0) {
      const rebuilt = await rebuildAggregates(oldCombos);
      return NextResponse.json({ success: true, synced: 0, rebuilt });
    }

    const customer = await findOrCreateCustomer(note);
    const context = await loadProductContext(items);
    const sourceRows = [];
    const newCombos: AggregateCombo[] = [];
    const matches = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { product, match } = await resolveProduct(item, context);
      const quantity = Number(item.quantity || 0);
      const unitPrice = toInteger(item.unitPrice ?? product.price);
      const amount = toInteger(item.amount ?? quantity * unitPrice);
      const sourceRecipeId = isUuid(item.sourceRecipeId) ? item.sourceRecipeId : null;

      sourceRows.push({
        external_delivery_note_id: note.id,
        external_line_id: item.lineId || String(item.lineNumber || i + 1),
        delivery_note_number: note.number || null,
        delivery_date: saleDate,
        doc_scanner_counterparty_id: note.counterpartyId || null,
        counterparty_name: note.counterpartyName || null,
        wholesale_customer_id: customer.id,
        product_id: product.id,
        source_recipe_id: sourceRecipeId,
        product_name: item.productName,
        quantity,
        unit: item.unit || null,
        unit_price: unitPrice,
        amount,
        transaction_type: note.transactionType || null,
        rate: note.rate ?? null,
        source_payload: item,
        updated_at: new Date().toISOString(),
      });
      newCombos.push({ productId: product.id, customerId: customer.id, saleDate });
      matches.push({
        line: item.lineNumber || i + 1,
        itemName: item.productName,
        productId: product.id,
        productName: product.product_name,
        match,
      });
    }

    const { error: insertSourceError } = await supabase
      .from('wholesale_delivery_note_sales')
      .insert(sourceRows);
    if (insertSourceError) throw insertSourceError;

    const rebuilt = await rebuildAggregates([...oldCombos, ...newCombos]);

    return NextResponse.json({
      success: true,
      synced: sourceRows.length,
      customer: { id: customer.id, name: customer.customer_name },
      matches,
      rebuilt,
    });
  } catch (error: any) {
    console.error('delivery-note-sync error:', error);
    return jsonError(error?.message || 'delivery note sync failed', 500);
  }
}
