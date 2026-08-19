import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { dispatchRecipePriceTsgNotifications } from "@/lib/recipe-price-tsg-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await dispatchRecipePriceTsgNotifications(
      getWebSalesAutomationServiceClient(),
      { limit: 50 },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TSG価格変更通知の再試行に失敗しました" },
      { status: 500 },
    );
  }
}
