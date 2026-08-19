import type { SupabaseClient } from "@supabase/supabase-js";

type RevisionRow = {
  id: string;
  recipe_id: string;
  previous_price_ex_tax: number | string;
  new_price_ex_tax: number | string;
  previous_price_incl_tax: number;
  new_price_incl_tax: number;
  recipe_snapshot: Record<string, unknown> | null;
  created_at: string;
};

type TsgPostResponse = {
  error?: string;
  post?: { id?: string };
  group?: { id?: string };
  url?: string;
};

function getTsgBaseUrl() {
  return (process.env.TSG_INTEGRATION_BASE_URL?.trim() || "https://v0-line-blush.vercel.app")
    .replace(/\/$/, "");
}

function textValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

async function postRevision(revision: RevisionRow) {
  const secret = process.env.TSG_INTEGRATION_SECRET?.trim();
  if (!secret) throw new Error("TSG_INTEGRATION_SECRET is not configured");
  const snapshot = revision.recipe_snapshot || {};
  const response = await fetch(`${getTsgBaseUrl()}/api/integrations/tsa/recipe-price-change`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tsg-integration-secret": secret,
    },
    body: JSON.stringify({
      sourceKey: revision.id,
      recipeId: revision.recipe_id,
      recipeName: textValue(snapshot.recipeName) || "名称未登録",
      ecProductName: textValue(snapshot.ecProductName),
      previousPriceExTax: Number(revision.previous_price_ex_tax),
      newPriceExTax: Number(revision.new_price_ex_tax),
      previousPriceInclTax: Number(revision.previous_price_incl_tax),
      newPriceInclTax: Number(revision.new_price_incl_tax),
      changedAt: revision.created_at,
    }),
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

export async function dispatchRecipePriceTsgNotifications(
  supabase: SupabaseClient,
  options: { recipeId?: string; limit?: number } = {},
) {
  const { data, error } = await supabase.rpc("claim_recipe_price_tsg_notifications", {
    p_limit: options.limit || 20,
    p_recipe_id: options.recipeId || null,
  });
  if (error) throw new Error(error.message);
  const revisions = (data || []) as RevisionRow[];
  const results: Array<{ id: string; status: "posted" | "failed"; error?: string }> = [];

  for (const revision of revisions) {
    try {
      const posted = await postRevision(revision);
      const { error: updateError } = await supabase
        .from("recipe_ec_price_revisions")
        .update({
          tsg_post_status: "posted",
          tsg_post_id: posted.postId,
          tsg_board_id: posted.boardId,
          tsg_post_url: posted.url,
          tsg_post_error: null,
          tsg_posted_at: new Date().toISOString(),
        })
        .eq("id", revision.id)
        .eq("tsg_post_status", "posting");
      if (updateError) throw new Error(updateError.message);
      results.push({ id: revision.id, status: "posted" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TSG投稿に失敗しました";
      await supabase
        .from("recipe_ec_price_revisions")
        .update({
          tsg_post_status: "failed",
          tsg_post_error: message.slice(0, 1000),
        })
        .eq("id", revision.id)
        .eq("tsg_post_status", "posting");
      results.push({ id: revision.id, status: "failed", error: message });
    }
  }

  return {
    claimed: revisions.length,
    posted: results.filter((result) => result.status === "posted").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}
