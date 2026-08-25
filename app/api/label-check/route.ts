import { NextRequest, NextResponse } from "next/server";
import { getLabelCheckAdminClient, getLabelCheckUserEmail } from "@/lib/label-check/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const email = await getLabelCheckUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = getLabelCheckAdminClient();
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
    const perPage = Math.min(50, Math.max(10, Number(request.nextUrl.searchParams.get("per_page")) || 20));
    const mode = request.nextUrl.searchParams.get("mode");
    const judgment = request.nextUrl.searchParams.get("judgment");
    const search = sanitizeSearch(request.nextUrl.searchParams.get("q") || "");

    let query = supabase
      .from("label_checks")
      .select(
        "id, mode, file_name, product_name, expiry_date_printed, expiry_date_normalized, manufacturing_date, matched_recipe_name, shelf_life, shelf_life_days, expected_expiry, judgment, deviation_percent, deviation_days, confidence, source, notes, worker_name, checked_by, created_at, label_check_images(id, sort_order)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);
    if (mode === "simple" || mode === "normal") query = query.eq("mode", mode);
    if (judgment === "OK" || judgment === "NG") query = query.eq("judgment", judgment);
    if (judgment === "UNKNOWN") query = query.in("judgment", ["UNKNOWN", "MANUAL"]);
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`product_name.ilike.${pattern},matched_recipe_name.ilike.${pattern},worker_name.ilike.${pattern},file_name.ilike.${pattern}`);
    }

    const [rowsResult, total, ok, ng, unknown, simple, normal] = await Promise.all([
      query,
      countRows(supabase),
      countRows(supabase, "judgment", "OK"),
      countRows(supabase, "judgment", "NG"),
      countUnknown(supabase),
      countRows(supabase, "mode", "simple"),
      countRows(supabase, "mode", "normal"),
    ]);
    if (rowsResult.error) throw rowsResult.error;

    const rows = (rowsResult.data || []).map((row) => {
      const images = Array.isArray(row.label_check_images)
        ? [...row.label_check_images].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        : [];
      const { label_check_images: _images, ...rest } = row;
      return { ...rest, image_id: images[0]?.id || null, image_count: images.length };
    });
    const filteredTotal = rowsResult.count || 0;
    return NextResponse.json({
      rows,
      stats: { total, ok, ng, unknown, simple, normal },
      pagination: {
        page,
        per_page: perPage,
        total: filteredTotal,
        total_pages: Math.max(1, Math.ceil(filteredTotal / perPage)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "履歴を取得できません";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function countRows(
  supabase: ReturnType<typeof getLabelCheckAdminClient>,
  column?: "judgment" | "mode",
  value?: string,
) {
  let query = supabase.from("label_checks").select("id", { count: "exact", head: true });
  if (column && value) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function countUnknown(supabase: ReturnType<typeof getLabelCheckAdminClient>) {
  const { count, error } = await supabase
    .from("label_checks")
    .select("id", { count: "exact", head: true })
    .in("judgment", ["UNKNOWN", "MANUAL"]);
  if (error) throw error;
  return count || 0;
}

function sanitizeSearch(value: string) {
  return value.trim().slice(0, 100).replace(/[%,_()]/g, " ").replace(/\s+/g, " ");
}
