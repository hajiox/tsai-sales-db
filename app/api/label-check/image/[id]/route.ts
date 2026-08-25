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

  const { data, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(image.storage_path, 90);
  if (signedError || !data?.signedUrl) {
    return NextResponse.json({ error: "画像を取得できません" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
