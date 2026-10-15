export type SuggestionPayload = Record<string, unknown>;

export type SuggestionResult = {
  markdown: string;
  detail?: Record<string, unknown> | null;
};
