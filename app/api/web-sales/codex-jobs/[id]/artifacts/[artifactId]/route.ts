import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id, artifactId } = await params;
  const supabase = getWebSalesAutomationServiceClient();
  const { data: artifact, error } = await supabase
    .from("web_sales_codex_artifacts")
    .select("file_name,storage_path,content_type")
    .eq("id", artifactId)
    .eq("job_id", id)
    .single();
  if (error || !artifact) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }
  const { data, error: downloadError } = await supabase.storage
    .from("web-sales-codex")
    .download(artifact.storage_path);
  if (downloadError || !data) {
    return NextResponse.json({ error: "ファイルを取得できません" }, { status: 500 });
  }
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "content-type": artifact.content_type || "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.file_name)}`,
      "cache-control": "private, no-store",
    },
  });
}
