import type { SuggestionPayload, SuggestionResult } from "./types";

const DEFAULT_ENDPOINT = "/api/ads/suggest";

async function callApi(input: SuggestionPayload): Promise<SuggestionResult> {
  const response = await fetch(DEFAULT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    let message = "AI suggestion request failed";
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) {
        message = body.error;
      }
    } catch (error) {
      console.error("Failed to parse AI error response", error);
    }
    throw new Error(message);
  }

  return (await response.json()) as SuggestionResult;
}

export async function generateSuggestion(
  input: SuggestionPayload
): Promise<SuggestionResult> {
  if (typeof window === "undefined") {
    const { generateSuggestionServer } = await import("./provider.server");
    return await generateSuggestionServer(input);
  }

  return await callApi(input);
}
