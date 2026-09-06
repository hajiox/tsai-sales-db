export type YahooStatementItem = { name: string; amount: number };
export type YahooStatement = { billing: YahooStatementItem[]; receipts: YahooStatementItem[] };

const ads = new Set(['PRオプション利用料', 'プロモーションパッケージ利用料', 'クリック課金型広告利用料', 'Yahoo!広告利用料', 'Yahoo!広告手数料', 'Google 広告利用料', 'Google 広告手数料']);
const categories: Record<string, string> = {
  'アフィリエイトパートナー報酬': 'platform_fees',
  'アフィリエイト手数料': 'platform_fees',
  'PayPay残高等決済手数料': 'payment_fees',
  'PayPayクレジット決済手数料': 'payment_fees',
  'カード決済手数料': 'payment_fees',
  'ワイジェイカード・PayPayカード決済手数料': 'payment_fees',
  '特典の一部利用手数料': 'payment_fees',
  '商品券決済手数料': 'payment_fees',
  '販促企画原資（特典の一部利用料）': 'seller_discounts',
  '販促企画原資': 'seller_discounts',
  'キャンペーン原資': 'seller_discounts',
  'レビューアッププログラム特典原資': 'seller_discounts',
  'ストアポイント原資': 'seller_points',
  'LINE公式アカウント利用料': 'other_costs',
  'あなただけのタイムセールシステム利用料': 'other_costs',
  'インテリジェントクーポンシステム利用料': 'other_costs',
  'レビューアッププログラム利用料': 'other_costs',
};
const receipts = new Set(['PayPayクレジット決済金額', 'PayPay残高等決済金額', 'カード決済金額', 'ワイジェイカード・PayPayカード決済金額', '商品券利用料', '特典の一部利用料', 'モールクーポン利用料']);

// Source amounts are gross tax-inclusive charges/credits, never AI-assigned categories.
export function classifyYahooStatement(statement: YahooStatement) {
  const result: Record<string, number> = {
    platform_fees: 0, payment_fees: 0, seller_discounts: 0, seller_coupons: 0,
    seller_points: 0, shipping_costs: 0, other_costs: 0, other_credits: 0,
    excluded_ad_costs: 0, excluded_marketplace_funded_discounts: 0,
  };
  let billingTotal = 0;
  let receiptTotal = 0;
  if (!statement.billing.length || !statement.receipts.length) throw new Error('Yahoo請求・受取明細の項目別合計が必要です');
  for (const side of ['billing', 'receipts'] as const) {
    const seen = new Set<string>();
    for (const item of statement[side]) {
      const name = item.name.trim();
      if (!Number.isFinite(item.amount) || item.amount < 0 || seen.has(name)) throw new Error(`Yahoo明細の金額または重複項目が不正です: ${name}`);
      seen.add(name);
      if (side === 'billing') billingTotal += item.amount;
      else receiptTotal += item.amount;
      const cancellation = name.endsWith('キャンセル分');
      const base = cancellation ? name.slice(0, -'キャンセル分'.length) : name;
      if (side === 'billing' && !cancellation) {
        const category = ads.has(name) ? 'excluded_ad_costs' : categories[name];
        if (!category) throw new Error(`Yahoo請求項目の分類確認が必要です: ${name}`);
        result[category] += item.amount;
      } else if (side === 'receipts' && cancellation) {
        if (ads.has(base)) result.excluded_ad_costs -= item.amount;
        else if (categories[base]) result.other_credits += item.amount;
        else throw new Error(`Yahoo返金項目の分類確認が必要です: ${name}`);
      } else if (side === 'receipts' && receipts.has(name)) {
        if (name === 'モールクーポン利用料') result.excluded_marketplace_funded_discounts += item.amount;
      } else if (!(side === 'billing' && cancellation && receipts.has(base))) {
        throw new Error(`Yahoo明細項目の分類確認が必要です: ${name}`);
      }
    }
  }
  if (result.excluded_ad_costs < 0) throw new Error('Yahoo広告返金が当月広告費を超えています');
  return { ...result, net_payout: receiptTotal - billingTotal };
}
