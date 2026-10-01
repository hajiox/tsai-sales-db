import { NextRequest, NextResponse } from "next/server";
import { parseReportedWebSalesCsv } from "@/lib/web-sales-automation/csv-import";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { csvContent } = await request.json();
    if (typeof csvContent !== "string" || !csvContent) return NextResponse.json({ success: false, error: "CSVデータがありません" }, { status: 400 });
    const rows = parseReportedWebSalesCsv("mercari", csvContent);
    const byName = new Map<string, { productName: string; count: number; amount: number }>();
    for (const row of rows) {
      const item = byName.get(row.name) || { productName: row.name, count: 0, amount: 0 };
      item.count += row.quantity;
      item.amount += row.amount;
      byName.set(row.name, item);
    }
    const aggregatedProducts = [...byName.values()].sort((a, b) => b.count - a.count);
    return NextResponse.json({
      success: true, aggregatedProducts,
      summary: {
        totalProducts: aggregatedProducts.length,
        totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
        totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
        blankTitleCount: 0, processedRows: rows.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "CSVの解析に失敗しました" }, { status: 400 });
  }
}
