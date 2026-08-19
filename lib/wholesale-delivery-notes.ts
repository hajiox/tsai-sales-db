import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set'); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set'); })()
);

export type DeliveryNoteItemInput = {
  productId: string;
  productName?: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
  remarks?: string;
};

export type DeliveryNoteCreateInput = {
  deliveryDate: string;
  customerId?: string;
  customerName?: string;
  transactionType?: string;
  rate?: number;
  memo?: string;
  items: DeliveryNoteItemInput[];
};

type DeliveryTransactionType = 'purchase' | 'consignment';

type AggregateCombo = {
  productId: string;
  customerId: string;
  saleDate: string;
};

function toInteger(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function comboKey(combo: AggregateCombo) {
  return `${combo.productId}|${combo.customerId}|${combo.saleDate}`;
}

function todayStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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

function normalizeTransactionType(value: unknown): DeliveryTransactionType | null {
  if (value === 'purchase' || value === 'consignment') return value;
  return null;
}

function resolveTransactionTerms(customer: any, input: DeliveryNoteCreateInput) {
  const transactionType = normalizeTransactionType(customer?.transaction_type)
    || normalizeTransactionType(input.transactionType)
    || 'purchase';
  const configuredRate = Number(customer?.default_rate);
  const requestedRate = Number(input.rate);
  const rate = Number.isFinite(configuredRate) && configuredRate > 0
    ? configuredRate
    : Number.isFinite(requestedRate) && requestedRate > 0
      ? requestedRate
      : transactionType === 'consignment' ? 0.70 : 0.65;

  return { transactionType, rate };
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

async function ensureCustomer(input: DeliveryNoteCreateInput) {
  if (input.customerId) {
    const { data, error } = await supabase
      .from('wholesale_customers')
      .select('*')
      .eq('id', input.customerId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const customerName = (input.customerName || '').trim();
  if (!customerName) throw new Error('発行先を選択してください');
  const normalized = normalizeName(customerName);

  const { data: customers, error } = await supabase
    .from('wholesale_customers')
    .select('*');
  if (error) throw error;

  const matched = (customers || []).find((c: any) =>
    normalizeName(c.normalized_name || c.customer_name) === normalized
  );
  if (matched) return matched;

  const { data: created, error: createError } = await supabase
    .from('wholesale_customers')
    .insert({
      customer_code: await nextCustomerCode(),
      customer_name: customerName,
      customer_type: '通常卸',
      transaction_type: normalizeTransactionType(input.transactionType) || 'purchase',
      default_rate: Number.isFinite(Number(input.rate)) && Number(input.rate) > 0
        ? Number(input.rate)
        : normalizeTransactionType(input.transactionType) === 'consignment' ? 0.70 : 0.65,
      is_active: true,
      is_favorite: false,
      favorite_order: null,
      normalized_name: normalized,
    })
    .select('*')
    .single();
  if (createError) throw createError;
  return created;
}

export async function getDeliveryNoteOptions() {
  const INCLUDE_RECIPE_CATEGORIES = ['自社', 'OEM'];
  const [customersRes, recipesRes] = await Promise.all([
    supabase
      .from('wholesale_customers')
      .select('id, customer_code, customer_name, customer_type, transaction_type, default_rate, is_active, is_favorite, favorite_order')
      .order('is_favorite', { ascending: false })
      .order('favorite_order', { ascending: true })
      .order('customer_name', { ascending: true }),
    supabase
      .from('recipes')
      .select('id, name, category, selling_price, is_intermediate, linked_wholesale_product_id, linked_oem_product_id, created_at')
      .eq('is_intermediate', false)
      .not('selling_price', 'is', null)
      .in('category', INCLUDE_RECIPE_CATEGORIES)
      .order('name', { ascending: true }),
  ]);

  if (customersRes.error) throw customersRes.error;
  if (recipesRes.error) throw recipesRes.error;

  const recipes = (recipesRes.data || []).filter((recipe: any) => {
    if (recipe.category === 'OEM') return Boolean(recipe.linked_oem_product_id || recipe.linked_wholesale_product_id);
    return Boolean(recipe.linked_wholesale_product_id);
  });
  const wholesaleProductIds = Array.from(new Set(
    recipes
      .map((recipe: any) => recipe.category === 'OEM'
        ? recipe.linked_oem_product_id || recipe.linked_wholesale_product_id
        : recipe.linked_wholesale_product_id
      )
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
  ));

  let wholesaleProducts: any[] = [];
  if (wholesaleProductIds.length > 0) {
    const { data, error } = await supabase
      .from('wholesale_products')
      .select('id, product_code, product_name, price, product_type, is_active, display_order')
      .in('id', wholesaleProductIds)
      .eq('is_active', true);
    if (error) throw error;
    wholesaleProducts = data || [];
  }

  const wholesaleProductMap = new Map(wholesaleProducts.map(product => [product.id, product]));
  const products = recipes
    .map((recipe: any) => {
      const linkedProductId = recipe.category === 'OEM'
        ? recipe.linked_oem_product_id || recipe.linked_wholesale_product_id
        : recipe.linked_wholesale_product_id;
      const product = wholesaleProductMap.get(linkedProductId);
      if (!product) return null;
      return {
        id: product.id,
        product_code: product.product_code,
        product_name: recipe.name,
        price: product.price,
        product_type: product.product_type,
        is_active: product.is_active,
        display_order: product.display_order,
        recipe_category: recipe.category,
        source_recipe_id: recipe.id,
        source_recipe_name: recipe.name,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.product_code || '').localeCompare(String(b.product_code || ''), 'ja');
    });

  return {
    customers: customersRes.data || [],
    products,
  };
}

export async function updateCustomerFavorite(customerId: string, isFavorite: boolean) {
  const { data, error } = await supabase
    .from('wholesale_customers')
    .update({
      is_favorite: isFavorite,
      favorite_order: isFavorite ? Math.floor(Date.now() / 1000) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .select('id, customer_code, customer_name, customer_type, transaction_type, default_rate, is_active, is_favorite, favorite_order')
    .single();

  if (error) throw error;
  return data;
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
      source_ref: 'tsa_web_delivery_notes',
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

export async function createWebDeliveryNote(input: DeliveryNoteCreateInput) {
  const deliveryDate = (input.deliveryDate || '').slice(0, 10);
  if (!deliveryDate) throw new Error('納品日を入力してください');
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('明細を追加してください');

  const customer = await ensureCustomer(input);
  const { transactionType, rate } = resolveTransactionTerms(customer, input);
  const productIds = [...new Set(input.items.map(i => i.productId).filter(Boolean))];
  if (productIds.length === 0) throw new Error('商品を選択してください');

  const { data: products, error: productsError } = await supabase
    .from('wholesale_products')
    .select('id, product_code, product_name, price')
    .in('id', productIds);
  if (productsError) throw productsError;
  const productMap = new Map((products || []).map((p: any) => [p.id, p]));

  const noteId = `tsa-web-${randomUUID()}`;
  const noteNumber = `TWDN${todayStamp()}`;
  const sourceRows = [];
  const combos: AggregateCombo[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`商品が見つかりません: ${item.productName || item.productId}`);

    const quantity = Number(item.quantity || 0);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    const unitPrice = toInteger(item.unitPrice ?? product.price);
    const amount = toInteger(quantity * unitPrice);

    sourceRows.push({
      external_delivery_note_id: noteId,
      external_line_id: String(i + 1),
      delivery_note_number: noteNumber,
      delivery_date: deliveryDate,
      doc_scanner_counterparty_id: null,
      counterparty_name: customer.customer_name,
      wholesale_customer_id: customer.id,
      product_id: product.id,
      source_recipe_id: null,
      product_name: item.productName || product.product_name,
      quantity,
      unit: item.unit || '個',
      unit_price: unitPrice,
      amount,
      transaction_type: transactionType,
      rate,
      source_payload: {
        source: 'tsa_web',
        memo: input.memo || null,
        productCode: product.product_code,
        remarks: item.remarks || null,
      },
      updated_at: new Date().toISOString(),
    });
    combos.push({ productId: product.id, customerId: customer.id, saleDate: deliveryDate });
  }

  if (sourceRows.length === 0) throw new Error('数量が0以外の明細を追加してください');

  const { error: insertError } = await supabase
    .from('wholesale_delivery_note_sales')
    .insert(sourceRows);
  if (insertError) throw insertError;

  const rebuilt = await rebuildAggregates(combos);
  return {
    id: noteId,
    number: noteNumber,
    deliveryDate,
    customer,
    itemCount: sourceRows.length,
    subtotal: sourceRows.reduce((sum, row) => sum + row.amount, 0),
    transactionType,
    rate,
    rebuilt,
  };
}

export async function getDeliveryNote(noteId: string) {
  const { data: rows, error } = await supabase
    .from('wholesale_delivery_note_sales')
    .select('*, wholesale_customers(customer_name, customer_code), wholesale_products(product_name, product_code, price)')
    .eq('external_delivery_note_id', noteId)
    .order('external_line_id', { ascending: true });
  if (error) throw error;
  if (!rows || rows.length === 0) return null;
  return formatDeliveryNote(rows);
}

export async function listDeliveryNotes(limit = 30) {
  const { data: rows, error } = await supabase
    .from('wholesale_delivery_note_sales')
    .select('*, wholesale_customers(customer_name, customer_code), wholesale_products(product_name, product_code, price)')
    .order('created_at', { ascending: false })
    .limit(Math.max(50, limit * 10));
  if (error) throw error;

  const grouped = new Map<string, any[]>();
  for (const row of rows || []) {
    const key = row.external_delivery_note_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  return [...grouped.values()]
    .map(formatDeliveryNote)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
}

export async function deleteDeliveryNote(noteId: string) {
  const { data: oldRows, error: oldError } = await supabase
    .from('wholesale_delivery_note_sales')
    .select('product_id, wholesale_customer_id, delivery_date')
    .eq('external_delivery_note_id', noteId);
  if (oldError) throw oldError;

  const combos = (oldRows || []).map((r: any) => ({
    productId: r.product_id,
    customerId: r.wholesale_customer_id,
    saleDate: String(r.delivery_date).slice(0, 10),
  }));

  const { error: deleteError } = await supabase
    .from('wholesale_delivery_note_sales')
    .delete()
    .eq('external_delivery_note_id', noteId);
  if (deleteError) throw deleteError;

  const rebuilt = await rebuildAggregates(combos);
  return { deleted: true, rebuilt };
}

function formatDeliveryNote(rows: any[]) {
  const sortedRows = [...rows].sort((a, b) => String(a.external_line_id).localeCompare(String(b.external_line_id), 'ja', { numeric: true }));
  const first = sortedRows[0];
  const items = sortedRows.map(row => ({
    id: row.id,
    lineId: row.external_line_id,
    productId: row.product_id,
    productName: row.product_name || row.wholesale_products?.product_name,
    productCode: row.wholesale_products?.product_code || null,
    quantity: Number(row.quantity || 0),
    unit: row.unit || '個',
    unitPrice: Number(row.unit_price || 0),
    amount: Number(row.amount || 0),
    remarks: row.source_payload?.remarks || null,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  return {
    id: first.external_delivery_note_id,
    number: first.delivery_note_number,
    deliveryDate: String(first.delivery_date).slice(0, 10),
    customerId: first.wholesale_customer_id,
    customerName: first.counterparty_name || first.wholesale_customers?.customer_name || '取引先不明',
    customerCode: first.wholesale_customers?.customer_code || null,
    transactionType: first.transaction_type || null,
    rate: first.rate === null || first.rate === undefined ? null : Number(first.rate),
    memo: first.source_payload?.memo || null,
    createdAt: first.created_at,
    itemCount: items.length,
    subtotal,
    items,
    source: String(first.external_delivery_note_id || '').startsWith('tsa-web-') ? 'tsa_web' : 'doc_scanner',
  };
}
