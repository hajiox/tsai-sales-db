import OpenAI from "openai";
import type { SuggestionPayload, SuggestionResult } from "./types";

const SYSTEM_PROMPT = `目的: BtoC食品ECのAmazon広告（月次キャンペーンCSVの集計結果）から、次月の具体アクションをMarkdownで提案せよ。
入力: { 1/3/6/12ヶ月の売上・費用・ROAS、前月比ワースト/ベスト、赤旗候補(売上大幅減×費用横ばい) } のJSON
制約:
- 6〜12行の箇条書き中心、冗長な説明はしない。
- 必ず「在庫/価格/レビュー/広告配置/検索語句」の観点を含める。
- 数値根拠(例: ROAS 1.2→0.8 等)を短く明記。
- 優先度A/B/Cを付与。Aは即実施（除外追加/入札調整/在庫復旧/予算配分）。
出力: Markdown（見出し: 概況 / 優先アクション / 伸長施策 / リスク点検）`;

const DEFAULT_MODEL = process.env.OPENAI_SUGGESTION_MODEL ?? "gpt-4o-mini";

export async function generateSuggestionServer(
  input: SuggestionPayload
): Promise<SuggestionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey });
  const userContent = JSON.stringify(input, null, 2);
  const response = await client.responses.create({
    model: DEFAULT_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "text", text: SYSTEM_PROMPT }],
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `以下の集計データを踏まえて、条件に沿ったMarkdownレポートを作成してください。\n\n${userContent}`,
          },
        ],
      },
    ],
  });

  const markdown = response.output_text?.trim();
  if (!markdown) {
    throw new Error("AIからの応答が空でした");
  }

  return {
    markdown,
    detail: {
      input,
      provider: "openai",
      model: DEFAULT_MODEL,
      createdAt: new Date().toISOString(),
    },
  };
}
