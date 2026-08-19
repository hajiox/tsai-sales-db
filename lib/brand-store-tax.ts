export type BrandStoreTaxRate = 8 | 10;

const REDUCED_TAX_CATEGORIES = [
  "TS自社商品",
  "Daily prime quality シリーズ",
  "既存業者【その他】",
  "2 久保田商会",
  "3 ハニー松本",
  "14 おくや",
  "16 五十嵐製麺",
  "34 会津山塩企業組合",
  "43 会津畜産",
  "78 檜枝岐養蜂場",
  "96 株式会社江川米菓店",
  "110 奈良屋",
  "187 Tregion株式会社",
  "191 小高工房",
  "192 福島りょうぜん漬け本舗",
  "194 有限会社５.SHES",
  "198 会津ブランド馬肉さくらの会",
  "199 清水薬草有限会社",
  "202 松葉屋商店",
] as const;

const STANDARD_TAX_PRODUCT_WORDS = [
  "せっけん",
  "石けん",
  "石鹸",
  "ワッペン",
  "ストラップ",
  "キーホルダー",
  "ポストカード",
  "エコバッグ",
  "マルシェバッグ",
  "箸",
  "スプーン",
  "フォーク",
  "皿",
  "椀",
  "グラス",
  "花札",
  "メモ帳",
  "ノート",
  "金封",
  "折り紙",
  "精油",
  "製油",
  "スプレー",
  "ディフューザー",
] as const;

const REDUCED_TAX_PRODUCT_WORDS = [
  "ラーメン",
  "カレー",
  "チャーシュー",
  "ソース",
  "ドレッシング",
  "みそ",
  "味噌",
  "しょうゆ",
  "醤油",
  "塩",
  "そば",
  "麺",
  "豆",
  "蜂蜜",
  "はちみつ",
  "コーヒー",
  "ドリップ",
  "茶",
  "人蔘",
  "人参",
  "漬",
  "ふりかけ",
  "煮干",
  "ジャーキー",
  "ソーセージ",
  "せんべい",
  "米",
  "麩",
  "一味",
  "辛油",
  "柚子胡椒",
  "マスタード",
  "ピーナ",
] as const;

export function normalizeBrandStoreTaxRate(value: unknown): BrandStoreTaxRate | null {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text) return null;
  if (text === "8" || text === "8%" || text.includes("軽減税率")) return 8;
  if (text === "10" || text === "10%" || text.includes("標準税率")) return 10;
  return null;
}

export function inferBrandStoreTaxRate(
  productName: unknown,
  categoryName?: unknown,
): BrandStoreTaxRate {
  const name = String(productName ?? "").normalize("NFKC");
  const category = String(categoryName ?? "").normalize("NFKC").trim();

  if (STANDARD_TAX_PRODUCT_WORDS.some((word) => name.includes(word))) return 10;
  if (REDUCED_TAX_CATEGORIES.some((value) => category === value.normalize("NFKC"))) return 8;
  if (category) return 10;
  if (REDUCED_TAX_PRODUCT_WORDS.some((word) => name.includes(word))) return 8;
  return 10;
}

export function taxIncludedYen(
  taxExclusivePrice: number | null | undefined,
  taxRate: BrandStoreTaxRate,
) {
  if (taxExclusivePrice === null || taxExclusivePrice === undefined) return null;
  if (!Number.isFinite(taxExclusivePrice)) return null;
  return Math.round((taxExclusivePrice * (100 + taxRate)) / 100);
}
