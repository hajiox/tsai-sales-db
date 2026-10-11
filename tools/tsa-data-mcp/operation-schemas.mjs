import { z } from 'zod/v4';

const key = z.string().min(8).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
export const operationSchemas = {
  catalog: z.object({}).strict(),
  run: z.object({
    operation: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_.-]{0,99}$/),
    input: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: key.optional(),
  }).strict(),
  status: z.object({ operationId: z.string().uuid().optional(), idempotencyKey: key.optional() })
    .strict().refine(value => Boolean(value.operationId) !== Boolean(value.idempotencyKey),
      'operationIdまたはidempotencyKeyの一方だけを指定してください。'),
};
