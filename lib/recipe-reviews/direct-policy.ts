import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { parseCollectionImport, sourceSchema, validReviewUrl } from "./model";

export const directRequestSchema = z.object({
  mode: z.enum(["collection", "analysis"]), jobId: z.string().uuid(),
  requestId: z.string().uuid(), expectedCollectionId: z.string().uuid().nullable(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/), data: z.unknown(),
  model: z.string().min(1).max(100).optional(),
}).strict();
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function directAuthorized(header: string | null, secret: string | undefined) {
  const token = header?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || !secret || secret.length < 32) return false;
  const a = Buffer.from(token), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export type Coverage = {channel: string; productKey: string; status: string; message: string; count: number};
export function prepareDirectCollection(input: unknown, targetInput: unknown, previous: Coverage[]) {
  const targets = sourceSchema.array().min(1).max(40).parse(targetInput);
  if (targets.some(t => !validReviewUrl(t.url,t.channel))) throw new Error("収集元URLが不正です");
  const data = parseCollectionImport(input);
  if (!data.sources.length) throw new Error("収集結果が空です");
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  const coverage = new Map(previous.map(s => [s.channel + ":" + s.productKey, s]));
  for (const source of data.sources) {
    const key = source.channel + ":" + source.productKey;
    if (seen.has(key) || !targets.some(t => t.channel === source.channel && t.productKey === source.productKey)) throw new Error("収集元が対象と一致しません");
    seen.add(key);
    if (["complete", "no_reviews"].includes(coverage.get(key)?.status ?? "")) throw new Error("取得済みの収集元です");
    if (["blocked", "no_reviews"].includes(source.status) && source.reviews.length || source.status === "complete" && !source.reviews.length) throw new Error("状態とレビュー数が一致しません");
    const ids = new Set<string>();
    for (const r of source.reviews) {
      if (!validReviewUrl(r.url, source.channel) || ids.has(r.externalId)) throw new Error("レビューURLまたはID重複が不正です");
      ids.add(r.externalId);
      rows.push({channel:source.channel,product_key:source.productKey,external_id:r.externalId,url:r.url,rating:r.rating,title:r.title,body:r.body,posted_at:r.postedAt});
    }
    coverage.set(key, {...source, count:source.reviews.length});
  }
  const sources = targets.map(t => {
    const s = coverage.get(t.channel + ":" + t.productKey);
    return {channel:t.channel,productKey:t.productKey,status:s?.status ?? "blocked",message:s?.message ?? "未収集",count:s?.count ?? 0};
  });
  const complete = sources.every(s => ["complete", "no_reviews"].includes(s.status));
  return {rows,result:{status:complete ? "completed" : rows.length ? "partial" : "blocked",message:data.message,sources,count:rows.length}};
}
