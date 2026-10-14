export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { extractCharSiuDeliveryNote } from "@/lib/char-siu-delivery-note-ai";
import { createClient } from "@supabase/supabase-js";
import { getBusinessAdminSession, isBusinessAdminSession } from "@/lib/data-access/business-operation-context";
import { normalizeCharSiuDate } from "@/lib/char-siu-production";
import { NextResponse } from "next/server";
import {
  isCompleteDeliveryNoteScan,
  publicDeliveryNoteScan,
} from "@/lib/char-siu-delivery-note";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxFileSize = 10 * 1024 * 1024;
const maxTotalFileSize = 3.5 * 1024 * 1024;
const maxFiles = 4;

export async function POST(request: Request) {
  let scanId = "";
  try {
    const token = await getAuthorizedIdentity(request);
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const targetProductionDate = normalizeCharSiuDate(formData.get("targetProductionDate"));
    if (!targetProductionDate) {
      return NextResponse.json({ success: false, error: "使用する製造日を入力してください" }, { status: 400 });
    }
    const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "納品書の写真を選択してください" }, { status: 400 });
    }
    if (files.length > maxFiles) {
      return NextResponse.json({ success: false, error: `写真は${maxFiles}枚までです` }, { status: 400 });
    }
    let totalFileSize = 0;
    for (const file of files) {
      if (!allowedMimeTypes.has(file.type)) {
        return NextResponse.json({ success: false, error: "JPEG、PNG、WebP、HEICの写真を使用してください" }, { status: 400 });
      }
      if (file.size > maxFileSize) {
        return NextResponse.json({ success: false, error: "写真1枚の上限は10MBです" }, { status: 400 });
      }
      totalFileSize += file.size;
    }
    if (totalFileSize > maxTotalFileSize) {
      return NextResponse.json({ success: false, error: "写真の合計容量が大きすぎます。枚数を減らして再撮影してください" }, { status: 400 });
    }

    const { data: scan, error: scanError } = await supabase
      .from("char_siu_delivery_note_scans")
      .insert({
        file_names: files.map((file) => file.name.slice(0, 180)),
        source_kind: "mobile_qr",
        target_production_date: targetProductionDate,
        status: "processing",
        created_by: String(token.email || ""),
      })
      .select("id")
      .single();
    if (scanError) throw scanError;
    scanId = scan.id;

    const { items, documentDate } = await extractCharSiuDeliveryNote(files);
    const complete = isCompleteDeliveryNoteScan(items);

    const { data: updated, error: updateError } = await supabase
      .from("char_siu_delivery_note_scans")
      .update({
        document_date: documentDate,
        status: "needs_review",
        extracted_items: items,
        error_message: complete ? null : "豚バラ肉・ネギ・生姜のいずれかを確定できませんでした",
      })
      .eq("id", scanId)
      .select("id,status,document_date,target_production_date,source_kind,file_names,extracted_items")
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      scan: publicDeliveryNoteScan(updated),
      message: complete
        ? "読み取りました。PCの確認画面で単価と数量を確定してください"
        : "読み取れない材料があります。PCの確認画面で補正してください",
    });
  } catch (error: any) {
    console.error("char siu delivery note scan error:", error);
    if (scanId) {
      await supabase
        .from("char_siu_delivery_note_scans")
        .update({ status: "error", error_message: String(error?.message || "AI読取エラー").slice(0, 500) })
        .eq("id", scanId);
    }
    return NextResponse.json({ success: false, error: error.message || "納品書のAI読取に失敗しました" }, { status: 500 });
  }
}

async function getAuthorizedIdentity(request: Request) {
  const session = await getBusinessAdminSession(request);
  return isBusinessAdminSession(session) ? session!.user : null;
}
