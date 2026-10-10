import { z } from 'zod/v4';

const uuid = z.string().uuid();
const numeric = z.number().min(-1e9).max(1e9).nullable().optional();
const source = uuid.nullable().optional();
const item = z.object({
  id: uuid.optional(),
  item_name: z.string().max(2000).refine(value => !value.includes('\u0000')).optional(),
  item_type: z.enum(['ingredient', 'material', 'expense', 'intermediate', 'product']).optional(),
  ingredient_id: source,
  material_id: source,
  expense_id: source,
  intermediate_recipe_id: source,
  unit_quantity: numeric,
  unit_price: numeric,
  usage_amount: numeric,
  unit_weight: numeric,
  tax_included: z.boolean().nullable().optional(),
}).strict().superRefine((value, context) => {
  const sources = ['ingredient_id', 'material_id', 'expense_id', 'intermediate_recipe_id'];
  if (sources.filter(field => value[field] != null).length > 1) {
    context.addIssue({ code: 'custom', message: '異なる種類の参照元IDを同時に指定できません。' });
  }
  if (value.item_type) {
    const expectedSource = { ingredient: 'ingredient_id', material: 'material_id', expense: 'expense_id', intermediate: 'intermediate_recipe_id', product: 'intermediate_recipe_id' }[value.item_type];
    if (sources.some(field => field !== expectedSource && value[field] != null)) {
      context.addIssue({ code: 'custom', message: '参照元IDは item_type と対応する項目に指定してください。' });
    }
  }
  if (value.id) return;
  if (value.item_type === undefined || !Object.hasOwn(value, 'usage_amount')) {
    context.addIssue({ code: 'custom', message: '新しい明細には item_type と usage_amount が必要です。' });
  }
  if (!value.item_name?.trim() && ![value.ingredient_id, value.material_id, value.expense_id, value.intermediate_recipe_id].some(Boolean)) {
    context.addIssue({ code: 'custom', message: '新しい明細には item_name または参照元IDが必要です。' });
  }
});
export const recipeItemsSchemas = {
  read: z.object({ recipeId: uuid }).strict(),
  prepare: z.object({
    recipeId: uuid,
    expectedVersion: z.string().regex(/^[a-f0-9]{32}$/),
    items: z.array(item).max(100).refine(values => {
      const ids = values.filter(value => value.id).map(value => value.id.toLowerCase());
      return new Set(ids).size === ids.length;
    }, '同じ明細IDを重複して指定できません。'),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/),
  }).strict(),
  apply: z.object({ changeId: uuid }).strict(),
};
