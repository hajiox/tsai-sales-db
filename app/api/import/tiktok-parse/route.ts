import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseReportedWebSalesCsv } from "@/lib/web-sales-automation/csv-import";

export async function POST(request: NextRequest) {
  try {
    const { csvText } = await request.json();
    if (typeof csvText !== "string" || !csvText) return NextResponse.json({ error: "CSVテキストが必要です" }, { status: 400 });
    const rows = parseReportedWebSalesCsv("tiktok", csvText);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: learns, error } = await supabase.from("tiktok_product_mapping").select("tiktok_product_name,product_id");
    if (error) throw new Error("商品紐付けの取得に失敗しました");
    const learningMap = new Map((learns || []).map(row => [row.tiktok_product_name, row.product_id]));
    const products = new Map<string, { title: string; count: number; saleDate: string; amount: number }>();
    for (const row of rows) {
      if (!row.occurredAt) throw new Error("注文の支払い日時を確認できません");
      // Keep the established free-sample exclusion, with an explicit source zero.
      if (row.amount === 0) continue;
      const date = row.occurredAt.slice(0, 10);
      const key = `${row.name}::${date}`;
      const item = products.get(key) || { title: row.name, count: 0, saleDate: date, amount: 0 };
      item.count += row.quantity;
      item.amount += row.amount;
      products.set(key, item);
    }
    const results = [...products.values()].map(row => ({
      ...row, productId: learningMap.get(row.title) || null, isLearned: learningMap.has(row.title),
    }));
    const learned = results.filter(row => row.isLearned);
    const unlearned = results.filter(row => !row.isLearned);
    return NextResponse.json({ success: true, results: { learned, unlearned }, summary: { total: results.length, learned: learned.length, unlearned: unlearned.length } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CSVの解析に失敗しました" }, { status: 400 });
  }
}
