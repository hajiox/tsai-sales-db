import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeCharSiuDate } from "@/lib/char-siu-production";
import { DELIVERY_NOTE_MATERIALS, normalizeDeliveryNoteItems } from "@/lib/char-siu-delivery-note";

/** Caller validates identity, target and image bounds; extraction never grants ready status. */
export async function extractCharSiuDeliveryNote(files: File[]) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("納品書AIが設定されていません");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
  const imageParts = await Promise.all(files.map(async (file) => ({
    inlineData: {
      data: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mimeType: file.type,
    },
  })));
  const prompt = buildPrompt();
  const result = await model.generateContent([prompt, ...imageParts]);
  const responseText = (await result.response).text().replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(responseText) as Record<string, unknown>;
  const items = normalizeDeliveryNoteItems(parsed.items);
  const documentDate = normalizeCharSiuDate(parsed.document_date) || null;

  return { items, documentDate };
}

function buildPrompt() {
  return `
あなたは食品工場の購買担当です。添付された納品書・請求明細の写真を読み取り、チャーシュー製造で使う次の3材料だけを抽出してください。

対象材料:
${DELIVERY_NOTE_MATERIALS.map((item) => `- ${item.key}: ${item.name}（表記候補: ${item.aliases.join("、")}）`).join("\n")}

必須ルール:
1. 写真が複数ある場合は同じ納品資料の続きとして扱ってください。
2. 対象外の商品は出力しないでください。推測で品目や価格を作らないでください。
3. purchase_unit_quantity_g は、その価格に対応する重量をグラムで返してください。
4. kg単価が記載されている場合は purchase_unit_quantity_g=1000 とし、その1kg価格を返してください。
5. 総重量と行金額しかない場合は、総重量をgに換算し、その行金額を返してください。
6. 税込価格が明示されていれば purchase_price_tax_included に、税抜価格なら purchase_price_tax_excluded に入れてください。食品税率は明示がなければ8%です。
7. 数字が判読できない場合はその材料をitemsに含めないでください。
8. evidence は根拠となった行の品名・数量・単価を短く要約してください。

JSONのみを次の形式で返してください:
{
  "document_date": "YYYY-MM-DD または null",
  "items": [
    {
      "material_key": "pork_belly | green_onion | ginger",
      "source_item_name": "納品書上の品名",
      "purchase_unit_quantity_g": 1000,
      "purchase_price_tax_excluded": 1000,
      "purchase_price_tax_included": null,
      "tax_rate": 0.08,
      "confidence": 0.95,
      "evidence": "根拠"
    }
  ]
}`;
}

