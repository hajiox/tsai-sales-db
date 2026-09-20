// Short, rank-specific display guidance. Traffic and financial ranks have
// different meanings; keep their recommendations separate.
export const TRAFFIC_GUIDANCE = {
  A: "利益・在庫を確認して集客を増やす",
  B: "商品画像・説明・価格・送料を見直す",
  C: "露出を増やし、少額で集客を試す",
  D: "商品ページと集客方法を見直す",
  保留: "データ不足・欠品・新商品を確認する",
} as const;

export const FINANCE_GUIDANCE = {
  A: "在庫を確保し、利益を保って販売を伸ばす",
  B: "広告費・原価・送料を見直し利益率を上げる",
  C: "利益率を保ちながら露出・販売数を増やす",
  D: "費用と商品訴求を見直し、育成の優先度を判断する",
  赤字: "広告増額の前に、価格・費用・原価を見直す",
  保留: "費用・原価・商品紐付けなどの不足を確認する",
} as const;
