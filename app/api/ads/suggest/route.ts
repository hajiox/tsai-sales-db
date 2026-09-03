import { NextResponse } from "next/server";
import { generateSuggestionServer } from "@/lib/ai/provider.server";
import type { SuggestionPayload } from "@/lib/ai/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: SuggestionPayload };
    if (!body?.input) {
      return NextResponse.json(
        { error: "input payload is required" },
        { status: 400 }
      );
    }

    const result = await generateSuggestionServer(body.input);
    return NextResponse.json(result);
  } catch (error) {
    console.error("AI suggestion API error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
