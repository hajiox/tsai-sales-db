import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import {
  isCodexBridgeAuthorized,
  normalizeWorkerId,
} from "@/lib/web-sales-codex/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SIZE = 25 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const formData = await request.formData();
    const workerId = normalizeWorkerId(formData.get("workerId"));
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "ファイルは25MB以下にしてください" }, { status: 413 });
    }
    const artifactType = String(formData.get("artifactType") || "source");
    if (!["source", "output", "log", "screenshot"].includes(artifactType)) {
      return NextResponse.json({ error: "Invalid artifact type" }, { status: 400 });
    }

    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id")
      .eq("id", id)
      .eq("worker_id", workerId)
      .single();
    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found for worker" }, { status: 404 });
    }

    const safeName = file.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "artifact.bin";
    const extensionMatch = safeName.toLowerCase().match(/\.[a-z0-9]{1,10}$/);
    const storagePath = `${id}/${crypto.randomUUID()}${extensionMatch?.[0] || ".bin"}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("web-sales-codex")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: artifact, error } = await supabase
      .from("web_sales_codex_artifacts")
      .insert({
        job_id: id,
        artifact_type: artifactType,
        file_name: safeName,
        storage_path: storagePath,
        content_type: file.type || "application/octet-stream",
        byte_size: file.size,
      })
      .select("id,file_name,artifact_type,byte_size,created_at")
      .single();
    if (error || !artifact) throw error || new Error("Artifact metadata insert failed");
    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Artifact upload failed" },
      { status: 400 },
    );
  }
}
