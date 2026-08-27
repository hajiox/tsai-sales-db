import { NextResponse } from "next/server";
import {
  DOCSCANNER_FAX_SUMMARY_MAX_IMAGE_BYTES,
  DOCSCANNER_FAX_SUMMARY_MAX_IMAGES,
  DOCSCANNER_FAX_SUMMARY_MODEL,
  DOCSCANNER_FAX_SUMMARY_REASONING_EFFORT,
  DOCSCANNER_FAX_SUMMARY_RULES_VERSION,
  DOCSCANNER_FAX_SUMMARY_TASK_KEY,
  faxSummaryIdempotencyKey,
  isDocScannerIntegrationAuthorized,
  normalizeDocScannerFaxSourceKey,
} from "@/lib/docscanner-fax-summary";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeImageFiles(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > DOCSCANNER_FAX_SUMMARY_MAX_IMAGES) {
    throw new Error(`FAX要約画像は1〜${DOCSCANNER_FAX_SUMMARY_MAX_IMAGES}枚で指定してください`);
  }
  return value.map((entry, index) => {
    const item = asObject(entry);
    const localPath = String(item.localPath || "").trim();
    const sha256 = String(item.sha256 || "").trim().toLowerCase();
    const size = Number(item.size);
    const page = Number(item.page);
    if (!/^[a-zA-Z]:[\\/]/.test(localPath) || localPath.length > 700) {
      throw new Error(`FAX要約画像${index + 1}のローカルパスが正しくありません`);
    }
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error(`FAX要約画像${index + 1}のハッシュが正しくありません`);
    }
    if (!Number.isInteger(size) || size < 1 || size > DOCSCANNER_FAX_SUMMARY_MAX_IMAGE_BYTES) {
      throw new Error(`FAX要約画像${index + 1}のサイズが正しくありません`);
    }
    if (!Number.isInteger(page) || page < 1 || page > DOCSCANNER_FAX_SUMMARY_MAX_IMAGES) {
      throw new Error(`FAX要約画像${index + 1}のページ番号が正しくありません`);
    }
    return {
      localPath,
      sha256,
      size,
      page,
      sourceFileName: cleanText(item.sourceFileName, 200),
    };
  }).sort((left, right) => left.page - right.page);
}

export async function POST(request: Request) {
  if (!isDocScannerIntegrationAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = asObject(await request.json());
    const sourceKey = normalizeDocScannerFaxSourceKey(body.sourceKey);
    const imageFiles = normalizeImageFiles(body.imageFiles);
    const sourceImageCount = Number(body.sourceImageCount);
    if (!Number.isInteger(sourceImageCount) || sourceImageCount < imageFiles.length || sourceImageCount > 72) {
      throw new Error("FAX元画像数が正しくありません");
    }
    const idempotencyKey = faxSummaryIdempotencyKey(sourceKey);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: existing, error: existingError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,status,progress,current_step,created_at,updated_at")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;

    const parameters = {
      taskKey: DOCSCANNER_FAX_SUMMARY_TASK_KEY,
      sourceKey,
      receivedAt: cleanText(body.receivedAt, 80),
      sourceImageCount,
      imageFiles,
      targets: ["TSG FAX受信"],
      model: DOCSCANNER_FAX_SUMMARY_MODEL,
      reasoningEffort: DOCSCANNER_FAX_SUMMARY_REASONING_EFFORT,
      rulesVersion: DOCSCANNER_FAX_SUMMARY_RULES_VERSION,
      executionPolicy: "local_images_then_fresh_ephemeral_codex_skill",
      mutationScope: "tsg_fax_summary_only",
    };

    if (existing && !["failed", "cancelled"].includes(String(existing.status))) {
      return NextResponse.json({ ok: true, reused: true, job: existing });
    }

    if (existing) {
      const { data: retried, error: retryError } = await supabase
        .from("web_sales_codex_jobs")
        .update({
          status: "queued",
          progress: 0,
          current_step: "FAX要約の再実行待ち",
          error_message: null,
          result: null,
          worker_id: null,
          attempt_count: 0,
          started_at: null,
          completed_at: null,
          heartbeat_at: null,
          lease_expires_at: null,
          parameters,
          scheduled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id,status,progress,current_step,created_at,updated_at")
        .single();
      if (retryError || !retried) throw retryError || new Error("FAX要約タスクを再登録できません");
      await supabase.from("web_sales_codex_job_events").insert({
        job_id: retried.id,
        event_type: "requeued",
        message: "FAX要約を再実行待ちに戻しました",
        progress: 0,
      });
      return NextResponse.json({ ok: true, reused: false, retried: true, job: retried });
    }

    const now = new Date().toISOString();
    const { data: job, error } = await supabase
      .from("web_sales_codex_jobs")
      .insert({
        task_key: DOCSCANNER_FAX_SUMMARY_TASK_KEY,
        channel: null,
        trigger_type: "manual",
        period_start: null,
        period_end: null,
        report_month: null,
        status: "queued",
        progress: 0,
        current_step: "FAX受信内容の要約待ち",
        requested_by: "docscanner",
        parameters,
        idempotency_key: idempotencyKey,
        priority: 70,
        max_attempts: 2,
        scheduled_at: now,
      })
      .select("id,status,progress,current_step,created_at,updated_at")
      .single();
    if (error || !job) throw error || new Error("FAX要約タスクを登録できません");

    await supabase.from("web_sales_codex_job_events").insert({
      job_id: job.id,
      event_type: "queued",
      message: "専用SkillによるFAX要約を実行待ちに登録しました",
      progress: 0,
      payload: { imageCount: imageFiles.length, model: DOCSCANNER_FAX_SUMMARY_MODEL },
    });
    return NextResponse.json({ ok: true, reused: false, job }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "FAX要約タスクを登録できません",
    }, { status: 400 });
  }
}
