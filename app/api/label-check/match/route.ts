import { NextResponse } from "next/server";
import { z } from "zod";
import { matchLabelToRecipes } from "@/lib/label-check/matching";
import { getLabelCheckAdminClient, getLabelCheckUserEmail } from "@/lib/label-check/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  product_name: z.string().trim().max(500).nullable().optional(),
  raw_materials: z.string().trim().max(12000).nullable().optional(),
  manufacturer: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request) {
  const email = await getLabelCheckUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = requestSchema.parse(await request.json());
    if (!body.product_name && !body.raw_materials) {
      return NextResponse.json({ error: "商品名または原材料名が必要です" }, { status: 400 });
    }
    const result = await matchLabelToRecipes(getLabelCheckAdminClient(), {
      productName: body.product_name,
      rawMaterials: body.raw_materials,
      manufacturer: body.manufacturer,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "入力内容が正しくありません" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "レシピ照合に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
