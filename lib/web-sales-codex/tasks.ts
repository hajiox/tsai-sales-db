import type { CodexTaskDefinition } from "./types";

const ARCHIVE_ROOT = String.raw`\\tshdd\disk\OneDrive共有\【共有】【事業】ネット通販総合\各サイト売上個数集計`;
const AD_ARCHIVE_ROOT = String.raw`\\tshdd\disk\OneDrive共有\【共有】【事業】ネット通販総合\【WEBマーケティング】\広告費取込`;
const EC_PROFIT_ARCHIVE_ROOT = String.raw`\\tshdd\disk\OneDrive共有\【共有】【事業】ネット通販総合\EC月次利益`;

export const WEB_SALES_CODEX_TASKS: CodexTaskDefinition[] = [
  {
    key: "web_sales_import",
    channel: "amazon",
    label: "Amazon 商品売上集計",
    shortLabel: "Amazon",
    description: "Seller Centralから商品別CSVを取得し、TSAへ取り込みます。",
    archiveFolder: `${ARCHIVE_ROOT}\\Amazon商品売上`,
    schedule: "中間：毎月16日 / 月次：毎月1日",
  },
  {
    key: "web_sales_import",
    channel: "rakuten",
    label: "楽天市場 商品売上集計",
    shortLabel: "楽天市場",
    description: "RMSから商品別CSVを取得し、TSAへ取り込みます。",
    archiveFolder: `${ARCHIVE_ROOT}\\楽天商品売上`,
    schedule: "中間：毎月16日 / 月次：毎月1日",
  },
  {
    key: "web_sales_import",
    channel: "yahoo",
    label: "Yahoo! 商品売上集計",
    shortLabel: "Yahoo!",
    description: "ストアクリエイターProから商品別CSVを取得し、TSAへ取り込みます。",
    archiveFolder: `${ARCHIVE_ROOT}\\Yahoo!商品売上`,
    schedule: "中間：毎月16日 / 月次：毎月1日",
  },
  {
    key: "web_sales_import",
    channel: "mercari",
    label: "メルカリShops 商品売上集計",
    shortLabel: "メルカリ",
    description: "メルカリShops管理画面から商品別CSVを取得し、TSAへ取り込みます。",
    archiveFolder: `${ARCHIVE_ROOT}\\メルカリ商品売上`,
    schedule: "中間：毎月16日 / 月次：毎月1日",
  },
  {
    key: "web_sales_import",
    channel: "base",
    label: "BASE 商品売上集計",
    shortLabel: "BASE",
    description: "BASE管理画面から商品別CSVを取得し、TSAへ取り込みます。",
    archiveFolder: `${ARCHIVE_ROOT}\\BASE商品売上`,
    schedule: "中間：毎月16日 / 月次：毎月1日",
  },
  {
    key: "web_sales_import",
    channel: "qoo10",
    label: "Qoo10 商品売上集計",
    shortLabel: "Qoo10",
    description: "QSMから商品別CSVを取得し、TSAへ取り込みます。",
    archiveFolder: `${ARCHIVE_ROOT}\\Qoo10商品売上`,
    schedule: "中間：毎月16日 / 月次：毎月1日",
  },
  {
    key: "web_sales_import",
    channel: "tiktok",
    label: "TikTok Shop 商品売上集計",
    shortLabel: "TikTok",
    description: "Seller Centerから商品別CSVを取得し、TSAへ取り込みます。",
    archiveFolder: `${ARCHIVE_ROOT}\\TikTok商品売上`,
    schedule: "中間：毎月16日 / 月次：毎月1日",
  },
];

export const AD_COST_CODEX_TASKS: CodexTaskDefinition[] = [
  {
    key: "ad_cost_import",
    channel: "google",
    label: "Google広告費取込",
    shortLabel: "Google",
    description: "Google Ads APIの月次実績を同期し、広告費へ反映します。",
    archiveFolder: `${AD_ARCHIVE_ROOT}\\Google広告`,
    schedule: "毎月1日（前月分）",
  },
  {
    key: "ad_cost_import",
    channel: "meta",
    label: "Meta広告費取込",
    shortLabel: "Meta",
    description: "広告セット別CSVを取得し、紐付け後に広告費へ反映します。",
    archiveFolder: `${AD_ARCHIVE_ROOT}\\Meta広告`,
    schedule: "毎月1日（前月分）",
  },
  {
    key: "ad_cost_import",
    channel: "rakuten",
    label: "楽天RPP広告費取込",
    shortLabel: "楽天RPP",
    description: "楽天RPPの商品別レポートを取得し、広告費へ反映します。",
    archiveFolder: `${AD_ARCHIVE_ROOT}\\楽天RPP`,
    schedule: "毎月1日（前月分）",
  },
  {
    key: "ad_cost_import",
    channel: "yahoo",
    label: "Yahoo広告費取込",
    shortLabel: "Yahoo!",
    description: "アイテムリーチ商品別レポートを取得し、広告費へ反映します。",
    archiveFolder: `${AD_ARCHIVE_ROOT}\\Yahooアイテムリーチ`,
    schedule: "毎月1日（前月分）",
  },
  {
    key: "ad_cost_import",
    channel: "amazon",
    label: "Amazon広告費取込",
    shortLabel: "Amazon広告",
    description: "SP広告対象商品レポートを取得し、広告費へ反映します。",
    archiveFolder: `${AD_ARCHIVE_ROOT}\\Amazon広告`,
    schedule: "毎月1日（前月分）",
  },
];

export const EC_PROFIT_CODEX_TASKS: CodexTaskDefinition[] = [
  {
    key: "ec_profit_import",
    channel: "amazon",
    label: "Amazon 手数料・値引取込",
    shortLabel: "Amazon",
    description: "ペイメント明細から手数料、返金、店舗負担割引などを取得します。",
    archiveFolder: `${EC_PROFIT_ARCHIVE_ROOT}\\Amazon`,
    schedule: "毎月1日・未完了は毎朝自動再実行",
  },
  {
    key: "ec_profit_import",
    channel: "rakuten",
    label: "楽天 手数料・値引取込",
    shortLabel: "楽天市場",
    description: "RMSの精算・受注明細から手数料、店舗負担クーポン、ポイントなどを取得します。",
    archiveFolder: `${EC_PROFIT_ARCHIVE_ROOT}\\楽天`,
    schedule: "毎月1日・概算行は翌月10営業日ごろ自動再照合",
  },
  {
    key: "ec_profit_import",
    channel: "yahoo",
    label: "Yahoo! 手数料・値引取込",
    shortLabel: "Yahoo!",
    description: "精算・注文関連明細から手数料、店舗負担クーポン、ポイントなどを取得します。",
    archiveFolder: `${EC_PROFIT_ARCHIVE_ROOT}\\Yahoo`,
    schedule: "毎月1日・未完了は毎朝自動再実行",
  },
  {
    key: "ec_profit_import",
    channel: "mercari",
    label: "メルカリShops 手数料取込",
    shortLabel: "メルカリ",
    description: "売上明細から販売手数料、返金、その他控除を取得します。",
    archiveFolder: `${EC_PROFIT_ARCHIVE_ROOT}\\メルカリ`,
    schedule: "毎月1日・未完了は毎朝自動再実行",
  },
  {
    key: "ec_profit_import",
    channel: "base",
    label: "BASE 手数料・値引取込",
    shortLabel: "BASE",
    description: "売上・振込明細から決済手数料、サービス利用料、クーポンなどを取得します。",
    archiveFolder: `${EC_PROFIT_ARCHIVE_ROOT}\\BASE`,
    schedule: "毎月1日・未完了は毎朝自動再実行",
  },
  {
    key: "ec_profit_import",
    channel: "qoo10",
    label: "Qoo10 手数料・値引取込",
    shortLabel: "Qoo10",
    description: "精算明細から販売手数料、割引負担、ポイント、返金などを取得します。",
    archiveFolder: `${EC_PROFIT_ARCHIVE_ROOT}\\Qoo10`,
    schedule: "毎月1日・未確定分は毎週木曜9:15に自動再照合",
  },
  {
    key: "ec_profit_import",
    channel: "tiktok",
    label: "TikTok Shop 手数料・値引取込",
    shortLabel: "TikTok",
    description: "精算明細から販売手数料、店舗負担割引、返金などを取得します。",
    archiveFolder: `${EC_PROFIT_ARCHIVE_ROOT}\\TikTok`,
    schedule: "毎月1日・未完了は毎朝自動再実行",
  },
];

export function getCodexTask(channel: string) {
  return WEB_SALES_CODEX_TASKS.find((task) => task.channel === channel);
}
