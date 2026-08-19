import { createClient } from "@supabase/supabase-js";

type FloorBoardStatus = {
  group?: { id?: string; name?: string };
  poster?: { id?: string; displayName?: string };
  error?: string;
};

function getTsgBaseUrl() {
  return (process.env.TSG_INTEGRATION_BASE_URL?.trim() || "https://v0-line-blush.vercel.app")
    .replace(/\/$/, "");
}

function getTsgClient() {
  const url = process.env.TSG_SUPABASE_URL?.trim();
  const key = process.env.TSG_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("TSG posting credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getFloorBoardStatus() {
  const secret = process.env.TSG_INTEGRATION_SECRET?.trim();
  if (!secret) throw new Error("TSG_INTEGRATION_SECRET is not configured");
  const response = await fetch(
    `${getTsgBaseUrl()}/api/integrations/doc-scanner/sales-broadcast`,
    { cache: "no-store", headers: { "x-tsg-integration-secret": secret } },
  );
  const data = await response.json().catch(() => ({})) as FloorBoardStatus;
  if (!response.ok) throw new Error(data.error || "TSGフロア掲示板を確認できません");
  const groupId = data.group?.id?.trim();
  const groupName = data.group?.name?.trim();
  const posterId = data.poster?.id?.trim();
  if (!groupId || !groupName || !posterId) {
    throw new Error("NEWブランド館（フロア）またはTSG君を特定できません");
  }
  return { groupId, groupName, posterId };
}

function sanitizeFloorSummary(summary: string) {
  const forbidden = /(広告|EC手数料|手数料|EC控除|精算|ROAS|CPA|CPC|利益率|粗利)/i;
  const lines = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !forbidden.test(line))
    .slice(0, 6);
  return (lines.join("\n") || "販売個数の集計が完了しました。詳細はTSAで確認してください。")
    .slice(0, 600);
}

export function buildWebSalesFloorPostContent(input: {
  month: string;
  periodStart: string;
  periodEnd: string;
  analysisType: "half_month" | "monthly";
  summary: string;
  sourceKey: string;
}) {
  const [year, month] = input.month.split("-");
  const isInterim = input.analysisType === "half_month";
  const title = isInterim
    ? `【WEB販売 ${Number(month)}月1日〜15日 中間報告】`
    : `【WEB販売 ${Number(month)}月 月次報告】`;
  return [
    title,
    "@フロア",
    sanitizeFloorSummary(input.summary),
    isInterim ? "※15日までの途中集計です。16日以降の販売は含みません。" : "※月次確定データの報告です。",
    `確認: https://v0-tsa-19.vercel.app/web-sales/dashboard?month=${year}-${month}`,
    `連携ID: ${input.sourceKey}`,
  ].join("\n");
}

export async function postWebSalesFloorSummary(input: {
  month: string;
  periodStart: string;
  periodEnd: string;
  analysisType: "half_month" | "monthly";
  summary: string;
  sourceKey: string;
}) {
  const status = await getFloorBoardStatus();
  const tsg = getTsgClient();
  const content = buildWebSalesFloorPostContent(input);
  const { data: existing, error: existingError } = await tsg
    .from("gw_posts")
    .select("id,group_id,user_id,content,created_at")
    .eq("group_id", status.groupId)
    .eq("user_id", status.posterId)
    .ilike("content", `%連携ID: ${input.sourceKey}%`)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    return {
      duplicate: true,
      group: { id: status.groupId, name: status.groupName },
      post: existing,
      url: `${getTsgBaseUrl()}/board/${status.groupId}#post-${existing.id}`,
    };
  }

  const { data: post, error: postError } = await tsg
    .from("gw_posts")
    .insert({
      group_id: status.groupId,
      user_id: status.posterId,
      content,
      attachments: [],
      parent_id: null,
    })
    .select("id,group_id,user_id,content,created_at")
    .single();
  if (postError || !post) throw new Error(postError?.message || "TSGフロア掲示板へ投稿できません");

  await tsg.from("gw_groups").update({ updated_at: new Date().toISOString() }).eq("id", status.groupId);
  return {
    duplicate: false,
    group: { id: status.groupId, name: status.groupName },
    post,
    url: `${getTsgBaseUrl()}/board/${status.groupId}#post-${post.id}`,
  };
}
