import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST: テーブルの自動作成を試みる（初回のみ必要）
export async function POST() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "public" },
  });

  // テーブルが存在するかチェック
  const { error: checkError } = await supabase
    .from("recipe_print_logs")
    .select("id")
    .limit(1);

  if (checkError && checkError.code === "42P01") {
    // テーブルが存在しない → メッセージを返す
    return NextResponse.json({
      error: "recipe_print_logs テーブルが存在しません。Supabase SQL Editor で以下を実行してください",
      sql: `CREATE TABLE IF NOT EXISTS recipe_print_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id uuid NOT NULL,
  recipe_name text NOT NULL,
  category text,
  version_number integer,
  version_note text,
  items jsonb,
  total_cost real,
  selling_price real,
  printed_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recipe_print_logs_processed ON recipe_print_logs(processed);
CREATE INDEX IF NOT EXISTS idx_recipe_print_logs_created ON recipe_print_logs(created_at);`,
    }, { status: 400 });
  }

  if (checkError) {
    return NextResponse.json({ error: checkError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "recipe_print_logs テーブルは存在します" });
}
