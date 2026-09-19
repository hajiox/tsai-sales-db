import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyze, type ImportInput } from "./model";

export async function saveAbcdSnapshot(db: SupabaseClient, input: ImportInput, actor: string) {
  const analysis = analyze(input);
  const { source: _source, ...identity } = input;
  const hash = createHash("sha256").update(JSON.stringify({ input: { ...identity, items: [...input.items].sort((a, b) => a.key.localeCompare(b.key)) }, rule: analysis.ruleVersion })).digest("hex");
  const existing = await db.from("web_sales_abcd_snapshots").select("id").eq("content_hash", hash).maybeSingle();
  if (existing.error) throw new Error("ABCD重複確認に失敗しました");
  if (existing.data) return { id: existing.data.id, duplicate: true };
  const saved = await db.from("web_sales_abcd_snapshots").insert({ channel: input.channel, period_start: input.start, period_end: input.end, metric: input.metric, scope: input.scope, source: input.source, item_count: input.items.length, content_hash: hash, payload: { input, analysis }, created_by: actor }).select("id").single();
  if (saved.error?.code === "23505") {
    const retry = await db.from("web_sales_abcd_snapshots").select("id").eq("content_hash", hash).single();
    if (retry.error) throw new Error("ABCD重複結果を取得できません");
    return { id: retry.data.id, duplicate: true };
  }
  if (saved.error) throw new Error("ABCD分析を保存できません");
  return { id: saved.data.id, duplicate: false };
}
