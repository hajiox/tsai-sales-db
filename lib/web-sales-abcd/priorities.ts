import type { FinanceAnalysis } from "./finance";
import type { ResultItem } from "./model";

export type Priority = {
  id: string; title: string; instruction: string; count: number;
  tone: "red" | "amber" | "blue" | "green";
  products: { key: string; name: string }[];
};

// Deterministic next steps from the displayed snapshot, not autonomous changes
// to campaigns or prices. Never suggest scaling ads on unverified profit.
export function buildPriorities(items: ResultItem[], finance?: FinanceAnalysis): Priority[] {
  const result: Priority[] = [];
  const byKey = new Map(finance?.items.map(i => [i.key, i]) ?? []);
  const add = (id: string, title: string, instruction: string, tone: Priority["tone"], targets: ResultItem[]) => {
    if (targets.length) result.push({ id, title, instruction, tone, count: targets.length, products: targets.slice(0, 3).map(i => ({ key: i.key, name: i.name })) });
  };
  const losses = items.filter(i => byKey.get(i.key)?.rank === "赤字")
    .sort((a, b) => byKey.get(a.key)!.profit! - byKey.get(b.key)!.profit!);
  add("loss", "赤字商品の原因を確認して改善する", "推計赤字額が大きい商品から、広告費・原価・送料・販売価格を確認してください。広告増額の前に、利益が残る条件へ見直します。", "red", losses);
  const blocked = items.filter(i => !byKey.has(i.key) || byKey.get(i.key)?.quality !== "推計");
  add("data", "費用・原価・商品紐付けを揃える", "詳細の「計算状態・保留理由」を確認し、不足する当月のEC費用・広告費・保存原価、または商品紐付けを補って再計算してください。費用一部の金額は参考値です。", "amber", blocked);
  add("margin", "売上のある商品の利益率を改善する", "収益Bの商品は、売上を保ちながら広告費・手数料・送料・原価を点検してください。値引きや広告増額は、控除後利益を確認して判断します。", "amber", items.filter(i => byKey.get(i.key)?.rank === "B")
    .sort((a,b) => (byKey.get(b.key)?.sales ?? 0) - (byKey.get(a.key)?.sales ?? 0)));
  add("page", "見られている商品の購入率を改善する", "アクセスBの商品から、1枚目の画像・商品説明・価格・送料の見せ方を確認してください。変更内容を改善履歴に残し、次の期間の購入率と比較します。", "blue", items.filter(i => i.rank === "B" && byKey.get(i.key)?.rank !== "赤字")
    .sort((a,b) => (b.access ?? 0) - (a.access ?? 0)));
  add("growth", "利益の残る商品で集客を小さく試す", "収益A/CかつアクセスA/Cの商品が対象です。まず在庫と推計利益を確認し、少額で露出を増やして、広告費控除後も利益が残るか検証してください。", "green", items.filter(i => ["A", "C"].includes(i.rank) && ["A", "C"].includes(byKey.get(i.key)?.rank ?? "")));
  add("review", "優先度の低い商品の改善余地を確認する", "収益DまたはアクセスDの商品は、過去の改善履歴と販売条件を確認してください。分類だけで販売終了を決めず、検証する商品を絞ります。", "blue", items.filter(i => byKey.get(i.key)?.rank !== "赤字" && (i.rank === "D" || byKey.get(i.key)?.rank === "D")));
  add("traffic", "アクセス不足・販売状態を確認する", "アクセス判定が保留の商品は、アクセス数・欠品・新商品などの理由を確認してください。比較できる実績を蓄積してから、集客やページ変更の効果を判断します。", "blue", items.filter(i => i.rank === "保留"));
  if (!result.length) result.push({ id: "monitor", title: "現在の利益と購入率を維持する", instruction: "在庫と広告費控除後利益を確認し、次の月次結果で変化を点検してください。", tone: "green", count: items.length, products: [] });
  return result;
}
