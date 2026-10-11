import { hasBusinessOperationContext } from "@/lib/data-access/business-operation-context";
import { NextResponse } from "next/server";
import { getLabelCheckAdminClient, getLabelCheckUserEmail } from "@/lib/label-check/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "label-check-images";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const email = await getLabelCheckUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const supabase = getLabelCheckAdminClient();
  const { data: image, error } = await supabase
    .from("label_check_images")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "画像を取得できません" }, { status: 500 });
  if (!image) return NextResponse.json({ error: "画像がありません" }, { status: 404 });

  // The MCP response carries bytes; signed storage URLs stay inside the server.
  if (hasBusinessOperationContext(_request)) {
    const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(image.storage_path);
    if (downloadError || !blob) return NextResponse.json({ error: "画像を取得できません" }, { status: 500 });
    return new Response(await blob.arrayBuffer(), { headers: { "Content-Type": blob.type || "application/octet-stream", "Cache-Control": "private, no-store" } });
  }

  const { data, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(image.storage_path, 90);
  if (signedError || !data?.signedUrl) {
    return NextResponse.json({ error: "画像を取得できません" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
