import { z } from "zod";
export const REVIEW_CHANNELS = { amazon: "Amazon", rakuten: "楽天", yahoo: "Yahoo", base: "BASE" } as const;
export const channelSchema = z.enum(["amazon", "rakuten", "yahoo", "base"]);
export type ReviewChannel = z.infer<typeof channelSchema>;
export function validReviewProductKey(key: string, channel: ReviewChannel) {
  if (!key || /^(name|unlinked):/i.test(key)) return false;
  if (channel === "amazon") return /^[A-Z0-9]{10}$/i.test(key);
  if (channel === "base") return /^\d+$/.test(key);
  return !/[\s:/]/.test(key);
}
export const sourceSchema = z.object({channel: channelSchema, productKey: z.string().trim().min(1).max(200), name: z.string().max(500), url: z.string().url().max(2000)}).refine(s=>validReviewProductKey(s.productKey,s.channel), "集計用の仮キーではなく実際の商品番号を指定してください");
export type ReviewSource = z.infer<typeof sourceSchema>;
export function validReviewUrl(value: string, channel: ReviewChannel) {
  try { const u = new URL(value); const domains = {amazon:["amazon.co.jp"],rakuten:["rakuten.co.jp"],yahoo:["shopping.yahoo.co.jp"],base:["thebase.in","thebase.com","base.shop","buyshop.jp","base.ec"]}[channel];
    const ownedBaseShop = channel === "base" && ["aizubrandhall-ec.com", "www.aizubrandhall-ec.com"].includes(u.hostname) && /^\/items\/\d+\/?$/.test(u.pathname);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && (ownedBaseShop || domains.some(d => u.hostname === d || u.hostname.endsWith("."+d)));
  } catch { return false; }
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s); return !isNaN(d.getTime()) && d.toISOString().slice(0,10) === s; });
export function normalizeReviewExternalId(channel: ReviewChannel, externalId: string, reviewUrl: string) {
  if (channel !== "rakuten" || !validReviewUrl(reviewUrl, channel)) return externalId;
  const url = new URL(reviewUrl);
  if (url.hostname !== "review.rakuten.co.jp") return externalId;
  // Only normalize a supplied ID whose identity is proved by this exact permalink.
  const match = url.pathname.match(/^\/item\/1\/\d+_\d+\/([a-z0-9-]+_\d+)_(\d+)\/?$/i);
  if (!match) return externalId;
  const canonical = `${match[1]}/${match[2]}`;
  const raw = `${match[1]}_${match[2]}`;
  return [reviewUrl, canonical, raw].includes(externalId) ? canonical : externalId;
}
export const collectedReviewSchema = z.object({ externalId:z.string().min(1).max(300), url:z.string().url().max(2000), rating:z.number().int().min(1).max(5).nullable(), title:z.string().max(1000), body:z.string().max(12000), postedAt:date.nullable() }).refine(r => !!(r.title.trim() || r.body.trim()), "空のレビューは保存できません");
export const collectionSchema = z.object({status:z.enum(["completed","partial","blocked"]), message:z.string().max(1500), sources:z.array(z.object({channel:channelSchema,productKey:z.string().max(200),status:z.enum(["complete","partial","blocked","no_reviews"]),message:z.string().max(1500),reviews:z.array(collectedReviewSchema).max(200)})).max(40)}).transform(value=>({...value,sources:value.sources.map(source=>({...source,reviews:source.reviews.map(review=>({...review,externalId:normalizeReviewExternalId(source.channel,review.externalId,review.url)}))}))}));
export type ReviewRow = {id:string;channel:ReviewChannel;product_key:string;external_id:string;url:string;rating:number|null;title:string;body:string;posted_at:string|null;collected_at:string};
// Missing identifiers are uncollected evidence, never synthetic review identities.
export function parseCollectionImport(input: unknown) {
  const envelope = z.object({sources:z.array(z.object({channel:channelSchema,reviews:z.array(z.unknown()).max(200)}).passthrough()).max(40)}).passthrough().parse(input);
  let missing = 0;
  const sources = envelope.sources.map(source => {
    let omitted = 0;
    const reviews = source.reviews.filter(value => {
      if (!value || typeof value !== "object" || !("externalId" in value) || typeof value.externalId !== "string" || value.externalId.trim()) return true;
      // Validate all other fields even for omitted records. Do not hide malformed output.
      const review = collectedReviewSchema.parse({...value,externalId:"validation-only"});
      if (!validReviewUrl(review.url,source.channel)) throw new Error("レビューURLが不正です");
      omitted++; return false;
    });
    missing += omitted;
    if (!omitted) return source;
    if (!["complete","partial"].includes(String(source.status))) throw new Error("収集状態とレビュー数が一致しません");
    if (typeof source.message !== "string" || source.message.length > 1500) throw new Error("収集元メッセージが不正です");
    return {...source,reviews,status:"partial",message:`識別ID未取得${omitted}件は未収録。${source.message}`.slice(0,1500)};
  });
  // Validate the original envelope too, substituting only the missing identifier for validation.
  collectionSchema.parse({...envelope,sources:envelope.sources.map(s=>({...s,reviews:s.reviews.map(r=>r && typeof r === "object" && "externalId" in r && typeof r.externalId === "string" && !r.externalId.trim()?{...r,externalId:"validation-only"}:r)}))});
  const result = collectionSchema.parse({...envelope,sources});
  if (missing) { result.status="partial"; result.message=`識別ID未取得${missing}件は未収録。${result.message}`.slice(0,1500); }
  return result;
}
const topicSchema = z.object({title:z.string().min(1).max(120),description:z.string().min(1).max(1200),reviewIds:z.array(z.string().uuid()).min(1).max(15)});
export const analysisSchema = z.object({scopes:z.array(z.object({channel:z.enum(["all","amazon","rakuten","yahoo","base"]),summary:z.string().max(3000),strengths:z.array(topicSchema).max(8),issues:z.array(topicSchema).max(8),actions:z.array(topicSchema).max(8),limitations:z.string().max(1500)})).min(1).max(5)});
export function validateAnalysis(value:unknown, reviews: ReviewRow[]) {
  const parsed = analysisSchema.parse(value); const byId = new Map(reviews.map(r=>[r.id,r]));
  const expected = new Set(["all",...reviews.map(r=>r.channel)]);
  if (parsed.scopes.length !== expected.size || new Set(parsed.scopes.map(s=>s.channel)).size !== expected.size || parsed.scopes.some(s=>!expected.has(s.channel))) throw new Error("分析対象ECが一致しません");
  for(const scope of parsed.scopes) for(const topic of [...scope.strengths,...scope.issues,...scope.actions]) for(const id of topic.reviewIds) {
    const review=byId.get(id); if(!review || (scope.channel!=="all" && review.channel!==scope.channel)) throw new Error("分析根拠のレビューが対象外です");
  }
  return parsed;
}
export function reviewStats(rows:ReviewRow[]) { const rated=rows.filter(r=>r.rating!=null); return {count:rows.length,ratedCount:rated.length,average:rated.length?rated.reduce((s,r)=>s+r.rating!,0)/rated.length:null,distribution:[5,4,3,2,1].map(star=>({star,count:rated.filter(r=>r.rating===star).length}))}; }
