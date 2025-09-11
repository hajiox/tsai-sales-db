// /app/api/rcm/storage-probe/route.ts ver.1
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 環境変数（既存プロジェクトと同じものを使用）
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })(); // service_role を使う（APIサーバ側のみで参照）

// バケット名を固定（誤操作防止）
const BUCKET = "rcm-imports";

export const dynamic = "force-dynamic"; // Edge不可。Nodeで実行してね

export async function GET(req: NextRequest) {
  try {
    // 例: /api/rcm/storage-probe?path=rcm-2025-08-09-net.xlsx
    const url = new URL(req.url);
    const path = url.searchParams.get("path")?.trim();

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Supabase env not set (URL or SERVICE_ROLE_KEY missing)" },
        { status: 500 }
      );
    }
    if (!path) {
      return NextResponse.json(
        { ok: false, error: "Missing ?path=..." },
        { status: 400 }
      );
    }

    // path にスラッシュや相対パスを入れない運用（安全策）
    if (path.includes("..") || path.startsWith("/") || path.endsWith("/")) {
      return NextResponse.json(
        { ok: false, error: "Invalid path" },
        { status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false }
    });

    // メタデータ取得（存在確認）
    const { data: listData, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list("", { search: path });

    if (listErr) {
      return NextResponse.json({ ok: false, step: "list", error: listErr.message }, { status: 500 });
    }

    const hit = listData?.find((f) => f.name === path);
    if (!hit) {
      // 直下以外にあるかもなのでルート以外も軽く探す
      const { data: deepData, error: deepErr } = await supabase.storage.from(BUCKET).list("", { search: "" });
      if (deepErr) {
        return NextResponse.json({ ok: false, step: "deep-list", error: deepErr.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: false,
        error: "File not found in bucket root",
        hint: "バケット直下にあるか確認してください（フォルダ未使用推奨）",
        bucket: BUCKET,
        tried: path,
        rootFiles: deepData?.map(d => d.name) ?? []
      }, { status: 404 });
    }

    // 実ダウンロード（疎通確認）
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(path);

    if (dlErr) {
      return NextResponse.json({ ok: false, step: "download", error: dlErr.message }, { status: 500 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const bytes = arrayBuffer.byteLength;
    const contentType = (blob as any)?.type || "application/octet-stream";

    // 署名付きURL（短寿命）も返しておくとブラウザで開ける
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60); // 60秒

    if (signErr) {
      // 署名作成に失敗しても致命ではないので警告だけ返す
    }

    return NextResponse.json({
      ok: true,
      bucket: BUCKET,
      path,
      contentType,
      bytes,
      signedUrl: signed?.signedUrl ?? null
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
