import type { SupabaseClient } from "@supabase/supabase-js";

type RevisionRow = {
  id: string;
  recipe_id: string;
  previous_price_ex_tax: number | string;
  new_price_ex_tax: number | string;
  previous_price_incl_tax: number;
  new_price_incl_tax: number;
  recipe_snapshot: Record<string, unknown> | null;
  tsg_batch_id?: string | null;
  created_at: string;
};

type TsgPostResponse = {
  error?: string;
  post?: { id?: string };
  group?: { id?: string };
  url?: string;
};

type DispatchResult = {
  id: string;
  status: "posted" | "failed";
  error?: string;
};

function getTsgBaseUrl() {
  return (process.env.TSG_INTEGRATION_BASE_URL?.trim() || "https://v0-line-blush.vercel.app")
    .replace(/\/$/, "");
}

function textValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function revisionRequestItem(revision: RevisionRow) {
  const snapshot = revision.recipe_snapshot || {};
  return {
    revisionId: revision.id,
    recipeId: revision.recipe_id,
    recipeName: textValue(snapshot.recipeName) || "名称未登録",
    ecProductName: textValue(snapshot.ecProductName),
    previousPriceExTax: Number(revision.previous_price_ex_tax),
    newPriceExTax: Number(revision.new_price_ex_tax),
    previousPriceInclTax: Number(revision.previous_price_incl_tax),
    newPriceInclTax: Number(revision.new_price_incl_tax),
    changedAt: revision.created_at,
  };
}

export function buildRecipePriceTsgBatchRequest(batchId: string, revisions: RevisionRow[]) {
  return {
    sourceKey: `batch:${batchId}`,
    batchId,
    items: revisions.map(revisionRequestItem),
  };
}

async function postToTsg(body: Record<string, unknown>) {
  const secret = process.env.TSG_INTEGRATION_SECRET?.trim();
  if (!secret) throw new Error("TSG_INTEGRATION_SECRET is not configured");
  const response = await fetch(`${getTsgBaseUrl()}/api/integrations/tsa/recipe-price-change`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tsg-integration-secret": secret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as TsgPostResponse;
  if (!response.ok) throw new Error(payload.error || `TSG投稿に失敗しました（HTTP ${response.status}）`);
  const postId = payload.post?.id?.trim();
  const boardId = payload.group?.id?.trim();
  if (!postId || !boardId) throw new Error("TSG投稿結果を確認できません");
  const relativeUrl = payload.url?.trim() || `/board/${boardId}#post-${postId}`;
  const url = relativeUrl.startsWith("http") ? relativeUrl : `${getTsgBaseUrl()}${relativeUrl}`;
  return { postId, boardId, url };
}

async function postRevision(revision: RevisionRow) {
  return postToTsg({
    sourceKey: revision.id,
    ...revisionRequestItem(revision),
  });
}

async function markPosted(
  supabase: SupabaseClient,
  revisionIds: string[],
  posted: { postId: string; boardId: string; url: string },
) {
  const { error } = await supabase
    .from("recipe_ec_price_revisions")
    .update({
      tsg_post_status: "posted",
      tsg_post_id: posted.postId,
      tsg_board_id: posted.boardId,
      tsg_post_url: posted.url,
      tsg_post_error: null,
      tsg_posted_at: new Date().toISOString(),
    })
    .in("id", revisionIds)
    .eq("tsg_post_status", "posting");
  if (error) throw new Error(error.message);
}

async function markFailed(
  supabase: SupabaseClient,
  revisionIds: string[],
  message: string,
) {
  await supabase
    .from("recipe_ec_price_revisions")
    .update({
      tsg_post_status: "failed",
      tsg_post_error: message.slice(0, 1000),
    })
    .in("id", revisionIds)
    .eq("tsg_post_status", "posting");
}

async function dispatchBatch(
  supabase: SupabaseClient,
  revisions: RevisionRow[],
) {
  if (revisions.length === 0) return [] as DispatchResult[];
  const batchIds = [...new Set(revisions.map((revision) => revision.tsg_batch_id).filter(Boolean))];
  if (batchIds.length !== 1) throw new Error("TSG一括投稿の識別子が一致しません");
  const batchId = String(batchIds[0]);
  const revisionIds = revisions.map((revision) => revision.id);
  try {
    const posted = await postToTsg(buildRecipePriceTsgBatchRequest(batchId, revisions));
    await markPosted(supabase, revisionIds, posted);
    return revisionIds.map((id) => ({ id, status: "posted" as const }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "TSG一括投稿に失敗しました";
    await markFailed(supabase, revisionIds, message);
    return revisionIds.map((id) => ({ id, status: "failed" as const, error: message }));
  }
}

async function dispatchSingles(
  supabase: SupabaseClient,
  revisions: RevisionRow[],
) {
  const results: DispatchResult[] = [];
  for (const revision of revisions) {
    try {
      const posted = await postRevision(revision);
      await markPosted(supabase, [revision.id], posted);
      results.push({ id: revision.id, status: "posted" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TSG投稿に失敗しました";
      await markFailed(supabase, [revision.id], message);
      results.push({ id: revision.id, status: "failed", error: message });
    }
  }
  return results;
}

export async function dispatchRecipePriceTsgNotifications(
  supabase: SupabaseClient,
  options: { recipeId?: string; batchId?: string; limit?: number } = {},
) {
  const results: DispatchResult[] = [];
  let batchPostCount = 0;

  if (options.batchId || !options.recipeId) {
    const { data, error } = await supabase.rpc("claim_recipe_price_tsg_batch_notifications", {
      p_batch_id: options.batchId || null,
    });
    if (error) throw new Error(error.message);
    const revisions = (data || []) as RevisionRow[];
    if (revisions.length > 0) {
      results.push(...await dispatchBatch(supabase, revisions));
      batchPostCount = 1;
    }
  }

  if (!options.batchId) {
    const { data, error } = await supabase.rpc("claim_recipe_price_tsg_notifications", {
      p_limit: options.limit || 20,
      p_recipe_id: options.recipeId || null,
    });
    if (error) throw new Error(error.message);
    results.push(...await dispatchSingles(supabase, (data || []) as RevisionRow[]));
  }

  return {
    claimed: results.length,
    posted: results.filter((result) => result.status === "posted").length,
    failed: results.filter((result) => result.status === "failed").length,
    batchPosts: batchPostCount,
    results,
  };
}
