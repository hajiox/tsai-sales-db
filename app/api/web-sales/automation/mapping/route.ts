import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  getWebSalesAutomationServiceClient,
  rerunMappingFinalization,
} from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  try {
    const { unmatchedId, productId } = await request.json();
    if (!unmatchedId || !productId) {
      return NextResponse.json({ error: "商品と紐付け先を選択してください" }, { status: 400 });
    }
    const supabase = getWebSalesAutomationServiceClient();
    const { data: unmatched, error: findError } = await supabase
      .from("web_sales_sync_unmatched")
      .select("id,run_id,channel,external_product_key,external_product_name")
      .eq("id", unmatchedId)
      .eq("resolved", false)
      .single();
    if (findError || !unmatched) {
      return NextResponse.json({ error: "未紐付け商品が見つかりません" }, { status: 404 });
    }
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();
    if (productError || !product) {
      return NextResponse.json({ error: "TSA商品が見つかりません" }, { status: 404 });
    }
    const now = new Date().toISOString();
    const { error: mappingError } = await supabase
      .from("web_sales_external_mappings")
      .upsert({
        channel: unmatched.channel,
        external_product_key: unmatched.external_product_key,
        external_product_name: unmatched.external_product_name,
        product_id: productId,
        match_source: "manual",
        updated_at: now,
      }, { onConflict: "channel,external_product_key" });
    if (mappingError) throw mappingError;
    await supabase
      .from("web_sales_sync_unmatched")
      .update({ resolved: true, resolved_product_id: productId, resolved_at: now })
      .eq("run_id", unmatched.run_id)
      .eq("external_product_key", unmatched.external_product_key);

    const result = await rerunMappingFinalization(String(unmatched.run_id));
    const { data: run } = await supabase
      .from("web_sales_sync_runs")
      .select("metadata")
      .eq("id", unmatched.run_id)
      .maybeSingle();
    const metadata = run?.metadata && typeof run.metadata === "object"
      ? run.metadata as Record<string, unknown>
      : {};
    const codexJobId = typeof metadata.codex_job_id === "string" ? metadata.codex_job_id : "";
    if (codexJobId) {
      const { data: codexJob } = await supabase
        .from("web_sales_codex_jobs")
        .select("result")
        .eq("id", codexJobId)
        .maybeSingle();
      const previousResult = codexJob?.result && typeof codexJob.result === "object"
        ? codexJob.result as Record<string, unknown>
        : {};
      const completed = result.status === "success";
      const summary = completed
        ? `${result.quantityTotal}個をTSAへ登録しました`
        : `${result.unmatchedCount}商品が未マッチのため、月次集計は更新していません`;
      const details = completed
        ? `${result.matchedCount}商品をすべて照合し、数量${result.quantityTotal}個の月次集計を更新しました。`
        : `${result.unmatchedCount}商品の紐付けが残っています。未紐付けを解消後に再確定してください。`;
      await supabase
        .from("web_sales_codex_jobs")
        .update({
          status: completed ? "completed" : "needs_review",
          progress: 100,
          current_step: summary,
          result: {
            ...previousResult,
            status: completed ? "completed" : "needs_review",
            summary,
            details,
            runId: unmatched.run_id,
            itemCount: result.itemCount,
            quantityTotal: result.quantityTotal,
            matchedCount: result.matchedCount,
            unmatchedCount: result.unmatchedCount,
            importedCount: completed ? result.quantityTotal : null,
            imported_count: completed ? result.quantityTotal : null,
          },
          error_message: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", codexJobId);
    }
    return NextResponse.json({ ok: true, runId: unmatched.run_id, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "商品紐付けを保存できません" },
      { status: 500 },
    );
  }
}
