import { z } from 'zod/v4';

// Mirrors the public API contract, not database column discovery. The server enforces this again.
const textFields = {
  recipes: ['name', 'category', 'manufacturing_notes', 'web_description', 'product_points', 'storage_method', 'shelf_life', 'filling_quantity', 'filling_quantity_unit', 'label_quantity', 'net_content_unit', 'sterilization_method', 'sterilization_temperature', 'sterilization_time', 'ingredient_label'],
  ingredients: ['name', 'raw_materials', 'allergens', 'origin', 'manufacturer', 'product_description', 'nutrition_per'],
  materials: ['name', 'unit_quantity', 'supplier', 'notes'],
  expenses: ['name', 'notes'],
};
const createNumberFields = {
  recipes: ['selling_price', 'total_weight', 'yield_rate', 'lot_size', 'case_quantity'],
  ingredients: ['unit_quantity', 'price', 'calories', 'protein', 'fat', 'carbohydrate', 'sodium', 'salt'],
  materials: ['price'],
  expenses: ['unit_price', 'unit_quantity'],
};
const createBooleanFields = { recipes: ['is_intermediate'], ingredients: ['tax_included'], materials: ['tax_included'], expenses: ['tax_included'] };
const requiredCreateFields = { recipes: ['name', 'category'], ingredients: ['name', 'unit_quantity', 'price', 'tax_included'], materials: ['name', 'unit_quantity', 'price', 'tax_included'], expenses: ['name', 'unit_quantity', 'unit_price', 'tax_included'] };
const uuid = z.string().uuid();
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);
const version = z.string().regex(/^[a-f0-9]{32}$/);

function valuesSchema(resource, operation) {
  const fields = {};
  for (const field of textFields[resource]) {
    if (operation === 'update' && (field === 'category' || (resource === 'materials' && field === 'unit_quantity'))) continue;
    const text = z.string().max(field === 'name' ? 300 : 10000).refine(value => !value.includes('\u0000'), 'NUL は使用できません。');
    fields[field] = field === 'name' || field === 'category'
      ? text.refine(value => value.trim().length > 0, '空欄にはできません。').optional()
      : text.nullable().optional();
  }
  if (operation === 'create') {
    fields.name = z.string().trim().min(1).max(300).refine(value => !value.includes('\u0000'));
    if (resource === 'recipes') fields.category = z.string().trim().min(1).max(10000).refine(value => !value.includes('\u0000'));
    for (const field of createNumberFields[resource]) {
      let value = z.number().min(0).max(1e9);
      if (['unit_quantity', 'yield_rate'].includes(field)) value = value.positive();
      if (['lot_size', 'case_quantity'].includes(field)) value = value.int();
      fields[field] = requiredCreateFields[resource].includes(field) ? value.nullable() : value.nullable().optional();
    }
    for (const field of createBooleanFields[resource]) fields[field] = requiredCreateFields[resource].includes(field) ? z.boolean() : z.boolean().optional();
    if (resource === 'materials') fields.unit_quantity = z.string().max(10000).refine(value => !value.includes('\u0000')).nullable();
  }
  return z.object(fields).strict().refine(value => Object.keys(value).length > 0, '変更項目を指定してください。');
}

export function changeSchema(resource) {
  return z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('update'), id: uuid, expectedVersion: version, values: valuesSchema(resource, 'update'), idempotencyKey }).strict(),
    z.object({ operation: z.literal('create'), values: valuesSchema(resource, 'create'), idempotencyKey }).strict(),
  ]);
}
