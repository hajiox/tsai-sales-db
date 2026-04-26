// app/api/lp-tracking/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from("lp_tracking_targets")
    .select("*, links:lp_tracking_links(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const body = await request.json();
  const { management_name, lp_url, product_value, meta_pixel_id, status, test_status, memo, is_active, links } = body;

  if (!management_name || !lp_url) {
    return NextResponse.json({ error: "管理名とLP URLは必須です" }, { status: 400 });
  }

  const { data: targetData, error: targetError } = await supabase
    .from("lp_tracking_targets")
    .insert({
      management_name,
      lp_url,
      product_value,
      meta_pixel_id,
      status: status || '未実装',
      test_status: test_status || 'テスト未',
      memo,
      is_active: is_active ?? true
    })
    .select()
    .single();

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });

  if (links && links.length > 0) {
    const linksToInsert = links.map((link: any) => ({
      target_id: targetData.id,
      destination_name: link.destination_name,
      destination_value: link.destination_value,
      url: link.url,
      is_active: link.is_active ?? true,
      is_tracking_target: link.is_tracking_target ?? true,
      is_tested: link.is_tested ?? false,
      memo: link.memo
    }));

    const { error: linksError } = await supabase
      .from("lp_tracking_links")
      .insert(linksToInsert);

    if (linksError) {
      console.error("Error inserting links:", linksError);
    }
  }

  return NextResponse.json({ data: targetData });
}
