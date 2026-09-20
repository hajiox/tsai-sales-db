import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { analyze, channelSchema, importSchema } from "@/lib/web-sales-abcd/model";
import { guessMapping, mapRows, readCsv, type Mapping } from "@/lib/web-sales-abcd/csv";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ACTIVE_EC_CHANNELS } from "@/lib/web-sales-abcd/monthly";
import { createFinanceLoader } from "@/lib/web-sales-abcd/finance-server";
import type { Snapshot } from "@/lib/web-sales-abcd/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const summaryColumns = "id,channel,period_start,period_end,metric,scope,source,item_count,created_at";
const admin = async () => {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === "aizubrandhall@gmail.com" ? session.user.email : null;
};
function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues.map(i => i.message).slice(0, 5).join(" / ") }, { status: 400 });
  console.error("ABCD request failed", error instanceof Error ? error.message : "database error");
  return NextResponse.json({ error: error instanceof Error ? error.message : "ABCDデータを処理できませんでした" }, { status: 400 });
}
export async function GET(request: Request) {
  if (!await admin()) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const db = getWebSalesAutomationServiceClient();
    const loadFinance = createFinanceLoader(db);
    async function financeFor(snapshot: Snapshot) {
      try { return { finance: await loadFinance(snapshot) }; }
      catch (error) { return { financeError: error instanceof Error ? error.message : "収益データを取得できません" }; }
    }
    if (params.get("view") === "overview") {
      const channels = await Promise.all(ACTIVE_EC_CHANNELS.map(async channel => {
        const result = await db.from("web_sales_abcd_snapshots").select(`${summaryColumns},payload`).eq("channel", channel).order("period_end", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (result.error) throw new Error("総合ダッシュボードを取得できません");
        const snapshot = result.data;
        const finance = snapshot ? await financeFor(snapshot as Snapshot) : { finance: undefined, financeError: undefined };
        return { channel, snapshot: snapshot ? {
          id: snapshot.id, period_start: snapshot.period_start, period_end: snapshot.period_end,
          created_at: snapshot.created_at, item_count: snapshot.item_count, metric: snapshot.metric,
          counts: Object.fromEntries(["A", "B", "C", "D", "保留"].map(rank => [rank, snapshot.payload.analysis.items.filter((item: { rank: string }) => item.rank === rank).length])),
          finance: finance.finance ? { counts: finance.finance.counts, calculatedAt: finance.finance.calculatedAt } : undefined,
          financeError: finance.financeError,
        } : null };
      }));
      return NextResponse.json({ channels });
    }
    if (params.get("id")) {
      const id = z.string().uuid().parse(params.get("id"));
      const result = await db.from("web_sales_abcd_snapshots").select(`${summaryColumns},payload`).eq("id", id).single();
      if (result.error) throw new Error("分析結果が見つかりません");
      const actions = await db.from("web_sales_abcd_actions").select("id,product_key,action_date,description,web_sales_abcd_snapshots!inner(channel)").eq("web_sales_abcd_snapshots.channel", result.data.channel).order("action_date", { ascending: false }).limit(1000);
      if (actions.error) throw new Error("改善履歴を取得できません");
      return NextResponse.json({ snapshot: { ...result.data, ...await financeFor(result.data as Snapshot) }, actions: actions.data });
    }
    const channel = channelSchema.parse(params.get("channel"));
    const result = await db.from("web_sales_abcd_snapshots").select(summaryColumns).eq("channel", channel).order("period_end", { ascending: false }).order("created_at", { ascending: false }).limit(100);
    if (result.error) throw new Error("分析履歴を取得できません");
    return NextResponse.json({ snapshots: result.data });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const email = await admin();
  if (!email) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "送信元が一致しません" }, { status: 403 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 3_500_000) throw new Error("CSVは3MB以下にしてください");
    const body = JSON.parse(raw);
    const db = getWebSalesAutomationServiceClient();
    if (body.mode === "action") {
      const value = z.object({ snapshot_id: z.string().uuid(), product_key: z.string().min(1).max(200), action_date: importSchema.innerType().shape.start, description: z.string().trim().min(1).max(1000) }).parse(body);
      const snap = await db.from("web_sales_abcd_snapshots").select("payload").eq("id", value.snapshot_id).single();
      if (snap.error || !snap.data.payload.input.items.some((i: { key: string }) => i.key === value.product_key)) throw new Error("対象商品が見つかりません");
      const result = await db.from("web_sales_abcd_actions").insert({ ...value, created_by: email }).select("id,product_key,action_date,description").single();
      if (result.error) throw new Error("改善履歴を保存できません");
      return NextResponse.json({ action: result.data });
    }
    if (!["inspect", "preview", "save"].includes(body.mode)) throw new Error("操作が正しくありません");
    const csv = z.string().min(1).max(3_000_000).parse(body.csv);
    const parsed = readCsv(csv);
    if (body.mode === "inspect") return NextResponse.json({ headers: parsed.headers, mapping: guessMapping(parsed.headers), rowCount: parsed.rows.length, metadata: parsed.metadata });
    const mapping = z.object({ key: z.string(), name: z.string(), access: z.string(), conversions: z.string(), sales: z.string(), profit: z.string(), state: z.string() }).parse(body.mapping) as Mapping;
    const input = importSchema.parse({ ...body.settings, items: mapRows(parsed.rows, mapping) });
    // Report metadata is a cross-check when an official preamble includes a range.
    const reportDates = parsed.metadata.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g)?.map(v => v.split(/[-/]/).map((p, i) => i ? p.padStart(2, "0") : p).join("-"));
    if (reportDates && reportDates.length === 2 && (reportDates[0] !== input.start || reportDates[1] !== input.end)) throw new Error("CSV記載の対象期間と入力した期間が一致しません");
    const analysis = analyze(input);
    if (body.mode === "preview") return NextResponse.json({ input, analysis });
    if (body.confirmed !== true) throw new Error("店舗・期間・分母と分子の確認が必要です");
    const { source: _source, ...identity } = input;
    const contentHash = createHash("sha256").update(JSON.stringify({ input: { ...identity, items: [...input.items].sort((a, b) => a.key.localeCompare(b.key)) }, rule: analysis.ruleVersion })).digest("hex");
    const existing = await db.from("web_sales_abcd_snapshots").select("id").eq("content_hash", contentHash).maybeSingle();
    if (existing.error) throw new Error("重複確認に失敗しました");
    if (existing.data) return NextResponse.json({ id: existing.data.id, duplicate: true });
    const result = await db.from("web_sales_abcd_snapshots").insert({ channel: input.channel, period_start: input.start, period_end: input.end, metric: input.metric, scope: input.scope, source: input.source, item_count: input.items.length, content_hash: contentHash, payload: { input, analysis }, created_by: email }).select("id").single();
    if (result.error?.code === "23505") {
      const retry = await db.from("web_sales_abcd_snapshots").select("id").eq("content_hash", contentHash).single();
      if (retry.error) throw new Error("重複結果を取得できません");
      return NextResponse.json({ id: retry.data.id, duplicate: true });
    }
    if (result.error) throw new Error("分析結果を保存できません");
    return NextResponse.json({ id: result.data.id });
  } catch (error) { return failure(error); }
}
