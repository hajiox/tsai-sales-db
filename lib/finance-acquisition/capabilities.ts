import { getConfiguredApiCredentialNames } from "./credential-store";

export type AcquisitionKind = "sales" | "ec_profit" | "advertising";
export const ACTIVE_FINANCE_CHANNELS = ["amazon", "rakuten", "yahoo", "base"] as const;
export const ADVERTISING_CHANNELS = ["google", "meta", "amazon", "rakuten", "yahoo"] as const;
export type AcquisitionCapability = {
  kind: AcquisitionKind; channel: string; preferred_route: "api" | "bridge" | "none";
  api_supported: boolean; api_ready: boolean; missing_config: string[]; reason: string;
  api_disabled_by_policy?: boolean;
};

const requirements: Record<string, string[][]> = {
  "sales:amazon": [["AMAZON_SP_API_ACCESS_TOKEN"], ["AMAZON_SP_API_CLIENT_ID", "AMAZON_SP_API_CLIENT_SECRET", "AMAZON_SP_API_REFRESH_TOKEN"]],
  "sales:rakuten": [["RAKUTEN_RMS_SERVICE_SECRET", "RAKUTEN_RMS_LICENSE_KEY"]],
  "sales:yahoo": [["YAHOO_SHOPPING_ACCESS_TOKEN"], ["YAHOO_SHOPPING_CLIENT_ID", "YAHOO_SHOPPING_CLIENT_SECRET", "YAHOO_SHOPPING_REFRESH_TOKEN"]],
  "sales:base": [["BASE_ACCESS_TOKEN"], ["BASE_CLIENT_ID", "BASE_CLIENT_SECRET", "BASE_REFRESH_TOKEN", "BASE_REDIRECT_URI"]],
  "ec_profit:amazon": [["AMAZON_SP_API_ACCESS_TOKEN"], ["AMAZON_SP_API_CLIENT_ID", "AMAZON_SP_API_CLIENT_SECRET", "AMAZON_SP_API_REFRESH_TOKEN"]],
  "ec_profit:base": [["BASE_ACCESS_TOKEN"], ["BASE_CLIENT_ID", "BASE_CLIENT_SECRET", "BASE_REFRESH_TOKEN", "BASE_REDIRECT_URI"]],
  "advertising:google": [["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_LOGIN_CUSTOMER_ID"]],
  "advertising:meta": [["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"]],
  "advertising:amazon": [["AMAZON_ADS_CLIENT_ID", "AMAZON_ADS_CLIENT_SECRET", "AMAZON_ADS_REFRESH_TOKEN", "AMAZON_ADS_PROFILE_ID"]],
};
const identityRequirements: Record<string, string[]> = {
  "sales:amazon": ["AMAZON_SP_API_SELLER_ID"], "ec_profit:amazon": ["AMAZON_SP_API_SELLER_ID"],
  "sales:yahoo": ["YAHOO_SHOPPING_SELLER_ID"], "sales:base": ["BASE_SHOP_ID"], "ec_profit:base": ["BASE_SHOP_ID"],
};

export function financeCapability(kind: AcquisitionKind, channel: string, configured: ReadonlySet<string>): AcquisitionCapability {
  const key = `${kind}:${channel}`;
  if (["mercari", "tiktok", "qoo10"].includes(channel)) {
    return { kind, channel, preferred_route: "none", api_supported: false, api_ready: false, missing_config: [], reason: "退店予定・新規取得対象外" };
  }
  // Yahoo finance acquisition remains on Bridge by the operator's choice,
  // regardless of saved OAuth credentials or the inventory server's API use.
  if (channel === "yahoo") {
    return { kind, channel, preferred_route: "bridge", api_supported: Boolean(requirements[key]), api_ready: false,
      api_disabled_by_policy: true, missing_config: [], reason: "Yahoo!は運用方針によりBridgeで公式ファイルを取得します" };
  }
  let alternatives = requirements[key];
  if (!alternatives) {
    const reason = channel === "rakuten"
      ? "楽天の広告・BillPayには公式APIがないため、公式ファイルを取得します"
      : "対象の精算・広告の公式API取得を確認できていないため、公式ファイルを取得します";
    return { kind, channel, preferred_route: "bridge", api_supported: false, api_ready: false, missing_config: [], reason };
  }
  const refreshName = channel === "amazon" ? "AMAZON_SP_API_REFRESH_TOKEN" : channel === "yahoo" ? "YAHOO_SHOPPING_REFRESH_TOKEN" : "BASE_REFRESH_TOKEN";
  if (kind !== "advertising" && configured.has(refreshName) && alternatives.length > 1) alternatives=alternatives.filter(names=>names.includes(refreshName));
  const candidates = alternatives.map(names => [...names, ...(identityRequirements[key] || [])].filter(name => !configured.has(name)));
  const missing = candidates.reduce((best, next) => next.length < best.length ? next : best);
  const ready = missing.length === 0;
  return { kind, channel, preferred_route: ready ? "api" : "bridge", api_supported: true, api_ready: ready, missing_config: missing,
    reason: ready ? "API設定済み。保存前に対象アカウント・期間・金額を検証します" : "API接続情報が不足しています。接続後はAPIを優先します" };
}

export async function getFinanceCapabilities(): Promise<AcquisitionCapability[]> {
  const configured = await getConfiguredApiCredentialNames();
  for (const alternatives of Object.values(requirements)) for (const names of alternatives) {
    for (const name of names) if (process.env[name]?.trim()) configured.add(name);
  }
  return [
    ...[...ACTIVE_FINANCE_CHANNELS, "mercari", "qoo10", "tiktok"].flatMap(channel => [financeCapability("sales", channel, configured), financeCapability("ec_profit", channel, configured)]),
    ...ADVERTISING_CHANNELS.map(channel => financeCapability("advertising", channel, configured)),
  ];
}
