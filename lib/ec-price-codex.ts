export const EC_PRICE_TARGETS = [
  { id: "amazon", label: "Amazon" },
  { id: "rakuten", label: "楽天" },
  { id: "yahoo", label: "Yahoo" },
  { id: "mercari", label: "メルカリ" },
  { id: "base", label: "BASE" },
  { id: "qoo10", label: "Qoo10" },
  { id: "tiktok", label: "TikTok" },
] as const;

export type EcPriceTarget = (typeof EC_PRICE_TARGETS)[number]["id"];

export interface EcPriceCodexRequest {
  targets: EcPriceTarget[];
  recipeId: string;
  recipeName: string;
  ecProductName?: string | null;
  linkedProductId?: string | null;
  janCode?: string | null;
  seriesCode?: number | null;
  productCode?: number | null;
  fillingQuantity?: string | number | null;
  fillingQuantityUnit?: string | null;
  storageMethod?: string | null;
  sellingPriceExTax: number;
  sellingPriceInclTax: number;
}

const CODEX_WORKSPACE_PATH = "C:\\作業用\\TSA";

const targetNames: Record<EcPriceTarget, string> = {
  amazon: "Amazon",
  rakuten: "楽天市場",
  yahoo: "Yahoo!ショッピング",
  mercari: "メルカリShops",
  base: "BASE",
  qoo10: "Qoo10",
  tiktok: "TikTok Shop",
};

const valueOrUnset = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "未登録";
  }
  return String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
};

export function getEcPriceTargetLabel(targets: EcPriceTarget[]) {
  if (targets.length === EC_PRICE_TARGETS.length) {
    return `全ECサイト（${EC_PRICE_TARGETS.map((target) => targetNames[target.id]).join("・")}）`;
  }
  return targets.map((target) => targetNames[target]).join("・");
}

export function buildEcPriceCodexPrompt(request: EcPriceCodexRequest) {
  const targetLabel = getEcPriceTargetLabel(request.targets);
  const quantity = [
    valueOrUnset(request.fillingQuantity),
    request.fillingQuantityUnit ? valueOrUnset(request.fillingQuantityUnit) : "",
  ].join("");

  return [
    "$update-aizu-ec-prices Skillを使用し、次の商品のEC販売価格を変更してください。",
    "",
    `対象EC: ${targetLabel}`,
    `新価格（税込）: ${request.sellingPriceInclTax.toLocaleString("ja-JP")}円`,
    `レシピ上の税抜価格: ${request.sellingPriceExTax.toLocaleString("ja-JP")}円`,
    `EC用商品名: ${valueOrUnset(request.ecProductName)}`,
    `レシピ名: ${valueOrUnset(request.recipeName)}`,
    `JANコード: ${valueOrUnset(request.janCode)}`,
    `内容量: ${quantity}`,
    `保存方法: ${valueOrUnset(request.storageMethod)}`,
    `レシピID: ${valueOrUnset(request.recipeId)}`,
    `内部商品ID: ${valueOrUnset(request.linkedProductId)}`,
    `シリーズコード: ${valueOrUnset(request.seriesCode)}`,
    `商品コード: ${valueOrUnset(request.productCode)}`,
    "",
    "実行条件:",
    "- ログイン済みChromeを使用する。対象外ECは価格確認のための読み取りだけにし、変更しない。",
    "- 変更前に各ECの現価格を記録し、商品名だけでなく形状・内容量・保存形態・JAN等を照合する。対象が曖昧なら変更せず質問する。",
    "- BASEとBASE管理のTikTok Shopは、Skillに定義された送料・差額ルールに従う。必要な旧価格や対応商品を確定できなければ変更しない。",
    "- 今回はEC価格だけを変更する。自社LPの変更・デプロイ、商品画像・商品名・商品ポイント・Web商品説明の変更は行わない。",
    "- 保存後は各ECのサーバー側の値を再確認し、成功・未変更・要確認をサイト別に報告する。",
  ].join("\n");
}

export function buildEcPriceCodexDeepLink(request: EcPriceCodexRequest) {
  const url = new URL("codex://new");
  url.searchParams.set("path", CODEX_WORKSPACE_PATH);
  url.searchParams.set("prompt", buildEcPriceCodexPrompt(request));
  return url.toString();
}
