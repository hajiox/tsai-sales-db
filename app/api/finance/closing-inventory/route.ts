import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { createClient } from "@supabase/supabase-js";
import { currentInventoryFiscalYear, normalizeInventoryFiscalYear } from "@/lib/inventory-fiscal";
import { inventorySources, buildClosingInventoryReport, type InventoryHeader, type SourceData, type SourceKey } from "@/lib/finance/closing-inventory";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const token = await getToken({ req: request as Parameters<typeof getToken>[0]["req"] });
  if (token?.email !== "aizubrandhall@gmail.com") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requested = new URL(request.url).searchParams.get("fiscalYear");
  const year = normalizeInventoryFiscalYear(requested);
  if (requested !== null && !year) return NextResponse.json({ error: "年度が不正です" }, { status: 400 });
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const histories = await Promise.all(inventorySources.map(async source => {
      const { data, error } = await db.from(source.table).select("id,fiscal_year,inventory_date,status").order("fiscal_year", { ascending: false });
      if (error) throw new Error(`${source.label}の棚卸しを取得できませんでした`);
      return data as InventoryHeader[];
    }));
    const years = [...new Set(histories.flat().map(row => row.fiscal_year))].sort((a, b) => b - a);
    const fiscalYear = year ?? years[0] ?? currentInventoryFiscalYear();
    const sources = {} as Record<SourceKey, SourceData>;
    await Promise.all(inventorySources.map(async (source, index) => {
      const inventory = histories[index].find(row => row.fiscal_year === fiscalYear) ?? null;
      const result: SourceData = { inventory, items: [] };
      sources[source.key] = result;
      if (!inventory) return;
      if (source.key === "food") {
        const { data, error } = await db.from(source.table).select("workbook").eq("id", inventory.id).single();
        if (error) throw new Error("食のブランド館の棚卸しを取得できませんでした");
        result.workbook = data.workbook;
      } else {
        for (let start = 0; ; start += 1000) {
          const { data, error } = await db.from(source.items!).select("*").eq("inventory_id", inventory.id).order("sort_order").order("id").range(start, start + 999);
          if (error) throw new Error(`${source.label}の明細を取得できませんでした`);
          result.items.push(...data);
          if (data.length < 1000) break;
        }
      }
    }));
    return NextResponse.json(buildClosingInventoryReport(fiscalYear, years, sources), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "棚卸し一覧を取得できませんでした" }, { status: 500 });
  }
}
