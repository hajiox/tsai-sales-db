'use client';

export type AnnualPeriod = {
  id: string;
  primaryDocumentId?: string | null;
  warnings?: string[];
  companyName: string;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  periodNumber: number | null;
  validation: Record<string, unknown>;
  metrics: Record<string, { amount: number }>;
};

export type AnnualRecord = {
  documentId: string;
  page: number;
  section: string;
  accountName: string;
  amount: number | null;
  rawText: string;
  metadata: Record<string, unknown>;
};

const yen = (value: number | null) =>
  value == null
    ? '未取得'
    : `${value < 0 ? '△' : ''}${Math.abs(Math.round(value)).toLocaleString('ja-JP')}円`;
const metric = (period: AnnualPeriod | null | undefined, key: string) =>
  period?.metrics[key]?.amount ?? null;

export function FinanceAnnualSummary({
  period,
  previous,
  records = [],
}: {
  period: AnnualPeriod;
  previous?: AnnualPeriod | null;
  records?: AnnualRecord[];
}) {
  const sales = metric(period, 'net_sales');
  const op = metric(period, 'operating_income');
  const net = metric(period, 'net_income');
  const cash = metric(period, 'cash_and_deposits');
  const equity = metric(period, 'net_assets');
  const debt = metric(period, 'long_term_borrowings');
  const inventory = metric(period, 'inventory');
  const openingInventory = metric(period, 'beginning_inventory');
  const cogs = metric(period, 'cogs');
  const depreciation = metric(period, 'depreciation_total');
  const priorSales = metric(previous, 'net_sales');
  const priorCash = metric(previous, 'cash_and_deposits');
  const supplement = (key: string) => {
    const candidates = records.filter(
      (row) => row.metadata.metricKey === key && row.amount != null,
    );
    const primary = candidates.find(
      (row) => row.documentId === period.primaryDocumentId,
    );
    if (primary) return primary;
    return new Set(candidates.map((row) => row.amount)).size === 1
      ? candidates[0]
      : undefined;
  };
  const shortfall = supplement('depreciation_shortfall');
  const taxDue = supplement('vat_final_due');
  const loss = supplement('loss_carryforward_remaining');
  const verified =
    period.validation.balanceSheetBalanced === true &&
    period.validation.profitLossCalculated === true;
  const opMargin = sales && op != null ? op / sales : null;
  const inventoryChange =
    inventory != null && openingInventory != null
      ? inventory - openingInventory
      : null;

  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-indigo-700">
            {period.periodNumber
              ? `第${period.periodNumber}期`
              : `${period.fiscalYear}年`}{' '}
            決算資料の総括
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            {verified ? '検算済み決算書' : '要確認の決算資料'}：
            {period.periodStart} ～ {period.periodEnd}
          </h2>
        </div>
        <a
          href={`/finance/annual-statements?id=${period.id}`}
          className="text-sm font-semibold text-indigo-700 underline"
        >
          原本・内訳・前期比較を見る
        </a>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            '売上高',
            yen(sales),
            sales != null && priorSales
              ? `前期比 ${((sales / priorSales - 1) * 100).toFixed(1)}％`
              : '前期比較未取得',
          ],
          [
            '営業利益',
            yen(op),
            opMargin != null
              ? `営業利益率 ${(opMargin * 100).toFixed(2)}％`
              : '利益率未取得',
          ],
          ['当期純利益', yen(net), '減価償却・法人税等計上後'],
          [
            '決算日現預金',
            yen(cash),
            cash != null && priorCash != null
              ? `前期差 ${yen(cash - priorCash)}`
              : '現在の口座残高ではありません',
          ],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-2 font-bold tabular-nums text-slate-900">
              {value}
            </dd>
            <dd className="mt-1 text-xs text-slate-500">{note}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
        {!!period.warnings?.length && (
          <p className="text-xs text-amber-800">
            OCRの補完・確認事項があります。検算済みは合計の整合性を示すもので、全明細の読取保証ではありません。原本・内訳の確認事項をご覧ください。
          </p>
        )}
        {equity != null && equity < 0 && <p className="text-rose-800">純資産は {yen(equity)}で債務超過です。{debt != null ? `長期借入金は ${yen(debt)}（役員借入を含む）です。` : ''}黒字額だけでなく、現預金と返済負担を優先して確認してください。</p>}
        {opMargin != null && (
          <p>
            {op != null && op < 0
              ? '決算書上は営業赤字です。'
              : opMargin < 0.03
                ? '決算書上は営業黒字ですが、利益率が薄く、原価や経費の小さな変化で赤字になりやすい水準です。'
                : '決算書上は営業黒字です。'}
            {sales && cogs != null
              ? ` 棚卸反映後の原価率は ${((cogs / sales) * 100).toFixed(2)}％です。`
              : ''}
          </p>
        )}
        {inventoryChange != null && (
          <p>
            期首在庫 {yen(openingInventory)} → 期末在庫 {yen(inventory)}（増減{' '}
            {yen(inventoryChange)}
            ）。在庫増加は売上原価を減らしますが、現金の増加とは別です。
          </p>
        )}
        {shortfall?.amount != null && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            償却明細の限度額と計上額の差は {yen(shortfall.amount)}（原本{' '}
            {shortfall.page}ページ）。営業利益からこの差を差し引いた参考値は{' '}
            {yen(op == null ? null : op - shortfall.amount)}
            です。これは税務上の償却額との比較で、確定決算の修正値や現金支出ではありません。
          </p>
        )}
        {net != null && depreciation != null && (
          <p>
            純利益＋計上済み減価償却費は {yen(net + depreciation)}
            。売掛・在庫・買掛の増減、設備購入、借入返済を含まないため、実際のキャッシュフローとは異なります。
          </p>
        )}
        {(taxDue || loss) && (
          <p>
            {taxDue
              ? `消費税・地方消費税の確定納付額は ${yen(taxDue.amount)}（原本 ${taxDue.page}ページ、支払済みかは資料から判定できません）。`
              : ''}
            {loss ? ` 翌期繰越欠損金は ${yen(loss.amount)}です。` : ''}
          </p>
        )}
      </div>
    </section>
  );
}
