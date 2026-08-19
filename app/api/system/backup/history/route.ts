import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { isCodexBridgeAuthorized } from "@/lib/web-sales-codex/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKUP_TYPES = new Set(["daily_data", "weekly_system_image", "manual_test"]);
const BACKUP_STATUSES = new Set(["running", "success", "warning", "failed"]);

function asOptionalText(value: unknown, maxLength = 2000) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function asDate(value: unknown, required: boolean) {
  const text = asOptionalText(value, 80);
  if (!text) {
    if (required) throw new Error("開始日時がありません");
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error("日時の形式が正しくありません");
  return date.toISOString();
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("pc_backup_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ runs: data || [] });
}

export async function POST(request: Request) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const runId = asOptionalText(body.runId, 160);
    const backupType = asOptionalText(body.backupType, 40);
    const status = asOptionalText(body.status, 40);
    if (!runId || !/^[a-zA-Z0-9._:-]{8,160}$/.test(runId)) {
      throw new Error("runIdが正しくありません");
    }
    if (!backupType || !BACKUP_TYPES.has(backupType)) {
      throw new Error("バックアップ種別が正しくありません");
    }
    if (!status || !BACKUP_STATUSES.has(status)) {
      throw new Error("状態が正しくありません");
    }

    const supabase = getWebSalesAutomationServiceClient();
    const { data: existing, error: existingError } = await supabase
      .from("pc_backup_runs")
      .select("*")
      .eq("run_id", runId)
      .maybeSingle();
    if (existingError) throw existingError;

    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const startedAt = has("startedAt")
      ? asDate(body.startedAt, true)
      : existing?.started_at;
    if (!startedAt) throw new Error("開始日時がありません");

    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      run_id: runId,
      backup_type: backupType,
      status,
      worker_id: has("workerId") ? asOptionalText(body.workerId, 80) || "tsa-office-01" : existing?.worker_id || "tsa-office-01",
      started_at: startedAt,
      updated_at: now,
    };
    if (has("hostName")) row.host_name = asOptionalText(body.hostName, 120);
    if (has("completedAt")) row.completed_at = asDate(body.completedAt, false);
    if (has("bytesTotal")) row.bytes_total = Math.max(0, Math.floor(Number(body.bytesTotal) || 0));
    if (has("fileCount")) row.file_count = Math.max(0, Math.floor(Number(body.fileCount) || 0));
    if (has("nasPath")) row.nas_path = asOptionalText(body.nasPath, 1000);
    if (has("cloudPath")) row.cloud_path = asOptionalText(body.cloudPath, 1000);
    if (has("usbPath")) row.usb_path = asOptionalText(body.usbPath, 1000);
    if (has("databaseChecks")) {
      row.database_checks = { ...asObject(existing?.database_checks), ...asObject(body.databaseChecks) };
    }
    if (has("details")) row.details = { ...asObject(existing?.details), ...asObject(body.details) };
    if (has("errorMessage")) row.error_message = asOptionalText(body.errorMessage, 8000);

    const { data, error } = await supabase
      .from("pc_backup_runs")
      .upsert(row, { onConflict: "run_id" })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, run: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "バックアップ履歴を保存できません" },
      { status: 400 },
    );
  }
}
