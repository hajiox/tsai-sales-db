import { createClient } from "@supabase/supabase-js";
import type { KpiCompletenessResult } from "@/lib/kpi-completeness";

type TsgIntegrationStatus = {
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
  if (!url || !key) {
    throw new Error("TSG posting credentials are not configured");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getManagementBoardStatus() {
  const secret = process.env.TSG_INTEGRATION_SECRET?.trim();
  if (!secret) throw new Error("TSG_INTEGRATION_SECRET is not configured");

  const response = await fetch(
    `${getTsgBaseUrl()}/api/integrations/doc-scanner/indeed-application`,
    {
      cache: "no-store",
      headers: { "x-tsg-integration-secret": secret },
    },
  );
  const data = await response.json().catch(() => ({})) as TsgIntegrationStatus;
  if (!response.ok) {
    throw new Error(data.error || "TSG管理職掲示板の取得に失敗しました");
  }

  const groupId = data.group?.id?.trim();
  const groupName = data.group?.name?.trim();
  const posterId = data.poster?.id?.trim();
  if (!groupId || !groupName || !posterId) {
    throw new Error("TSG管理職掲示板またはTSG君を特定できません");
  }
  return { groupId, groupName, posterId };
}

export function buildKpiReminderContent(
  result: KpiCompletenessResult,
  sourceKey: string,
) {
  return [
    "【売上KPI入力確認】",
    `${result.targetMonthLabel}の売上KPIダッシュボードに未入力があります。`,
    "",
    "未入力項目",
    ...result.missing.map((item) => `・${item}`),
    "",
    "月次集計を確定するため、入力をお願いします。",
    `確認先: https://v0-tsa-19.vercel.app/kpi?year=${result.fiscalYear}`,
    `通知ID: ${sourceKey}`,
  ].join("\n");
}

export async function postKpiReminderToTsg(
  result: KpiCompletenessResult,
  sourceKey: string,
) {
  const status = await getManagementBoardStatus();
  const tsg = getTsgClient();
  const content = buildKpiReminderContent(result, sourceKey);

  const { data: existing, error: existingError } = await tsg
    .from("gw_posts")
    .select("id, group_id, user_id, content, created_at")
    .eq("group_id", status.groupId)
    .eq("user_id", status.posterId)
    .ilike("content", `%通知ID: ${sourceKey}%`)
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
    .select("id, group_id, user_id, content, created_at")
    .single();
  if (postError || !post) {
    throw new Error(postError?.message || "TSGへのKPI確認投稿に失敗しました");
  }

  const { error: groupError } = await tsg
    .from("gw_groups")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", status.groupId);
  if (groupError) throw new Error(groupError.message);

  return {
    duplicate: false,
    group: { id: status.groupId, name: status.groupName },
    post,
    url: `${getTsgBaseUrl()}/board/${status.groupId}#post-${post.id}`,
  };
}
