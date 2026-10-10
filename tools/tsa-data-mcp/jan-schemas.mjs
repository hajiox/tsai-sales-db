import { z } from 'zod/v4';
const uuid = z.string().uuid();
const version = z.string().regex(/^[a-f0-9]{32}$/);
const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);
const metadata = {
 product_name: z.string().trim().min(1).max(2000).refine(value => !value.includes('\0')).optional(),
 category: z.enum(['食品', '物品']).optional(),
 price_excl_tax: z.number().min(0).max(1e9).nullable().optional(),
 ingredients: z.string().max(8000).refine(value => !value.includes('\0')).nullable().optional(),
 memo: z.string().max(8000).refine(value => !value.includes('\0')).nullable().optional(),
};
export const janSchemas = {
 list: z.object({ query: z.string().max(200).refine(value => !value.includes('\0')).optional(), category: z.enum(['食品','物品']).optional(), unassigned: z.boolean().optional(), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(10000).optional() }).strict(),
 issue: z.object({ values: z.object({ ...metadata, product_name: metadata.product_name.unwrap(), category: z.enum(['食品','物品']) }).strict(), recipeId: uuid.optional(), expectedVersion: version.optional(), idempotencyKey: key }).strict().refine(value => Boolean(value.recipeId) === Boolean(value.expectedVersion), 'レシピへ同時割当する場合はrecipeIdとレシピ詳細の最新_versionが必要です。'),
 assign: z.object({ janId: uuid, recipeId: uuid, expectedVersion: version, idempotencyKey: key }).strict(),
 update: z.object({ janId: uuid, expectedVersion: version, values: z.object(metadata).strict().refine(value => Object.keys(value).length > 0), idempotencyKey: key }).strict(),
 export: z.object({ janId: uuid, format: z.enum(['png','svg','eps']).default('png') }).strict(),
};
