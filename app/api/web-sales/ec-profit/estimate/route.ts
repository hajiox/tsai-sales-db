import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  EC_PROFIT_CHANNELS,
  type EcProfitChannel,
  upsertEcProfitEstimate,
} from "@/lib/web-sales-codex/ec-profit-estimate";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  channels: z.array(z.enum(EC_PROFIT_CHANNELS)).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  try {
    const input = schema.parse(await request.json());
    const channels = (input.channels?.length ? input.channels : ["rakuten", "qoo10"]) as EcProfitChannel[];
    const supabase = getWebSalesAutomationServiceClient();
    const results = [];
    for (const channel of channels) {
      results.push(await upsertEcProfitEstimate({ supabase, channel, reportMonth: input.month }));
    }
    return NextResponse.json({
      ok: true,
      estimated: results.filter((result) => result.status === "estimated").length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "概算を更新できませんでした" },
      { status: 500 },
    );
  }
}
