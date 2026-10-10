import { z } from 'zod/v4';

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const key = z.record(identifier, scalar).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 100);
const values = z.record(identifier, z.json()).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 100);
const version = z.string().regex(/^[a-f0-9]{32}$/);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);
export const businessSchemas = {
  catalog: z.object({ table: identifier.optional() }).strict(),
  read: z.object({ table: identifier, filters: z.record(identifier, scalar).optional(), columns: z.array(identifier).min(1).max(100).optional(), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(10000).default(0) }).strict(),
  prepare: z.discriminatedUnion('operation', [
    z.object({ table: identifier, operation: z.literal('create'), values, idempotencyKey }).strict(),
    z.object({ table: identifier, operation: z.literal('update'), key, expectedVersion: version, values, idempotencyKey }).strict(),
    z.object({ table: identifier, operation: z.literal('delete'), key, expectedVersion: version, idempotencyKey }).strict(),
  ]),
  apply: z.object({ changeId: z.string().uuid() }).strict(),
};
