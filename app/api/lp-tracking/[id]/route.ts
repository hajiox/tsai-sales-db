// app/api/lp-tracking/[id]/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from("lp_tracking_targets")
    .select("*, links:lp_tracking_links(*)")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const body = await request.json();
  const { management_name, lp_url, product_value, meta_pixel_id, status, test_status, memo, is_active, links } = body;

  const { error: targetError } = await supabase
    .from("lp_tracking_targets")
    .update({
      management_name,
      lp_url,
      product_value,
      meta_pixel_id,
      status,
      test_status,
      memo,
      is_active,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.id);

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });

  if (links) {
    // Upsert links: For simplicity, delete existing and re-insert, or upsert by ID.
    // Given we may have deleted links on client side, deleting all and re-inserting is easiest for now.
    await supabase.from("lp_tracking_links").delete().eq("target_id", params.id);
    
    if (links.length > 0) {
      const linksToInsert = links.map((link: any) => ({
        target_id: params.id,
        destination_name: link.destination_name,
        destination_value: link.destination_value,
        url: link.url,
        is_active: link.is_active ?? true,
        is_tracking_target: link.is_tracking_target ?? true,
        is_tested: link.is_tested ?? false,
        memo: link.memo
      }));

      const { error: linksError } = await supabase.from("lp_tracking_links").insert(linksToInsert);
      if (linksError) console.error("Error inserting links:", linksError);
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { error } = await supabase.from("lp_tracking_targets").delete().eq("id", params.id);
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
