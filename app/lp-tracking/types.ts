// app/lp-tracking/types.ts

export type LpTrackingTarget = {
  id: string;
  management_name: string;
  lp_url: string;
  product_value: string | null;
  meta_pixel_id: string | null;
  status: string;
  test_status: string;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  links?: LpTrackingLink[];
};

export type LpTrackingLink = {
  id: string;
  target_id: string;
  destination_name: string;
  destination_value: string | null;
  url: string | null;
  is_active: boolean;
  is_tracking_target: boolean;
  is_tested: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export const LP_STATUS_OPTIONS = [
  "未実装",
  "実装中",
  "実装済",
  "テスト中",
  "テスト済",
  "公開済",
  "要修正",
  "停止中"
];

export const DESTINATION_OPTIONS = [
  "rakuten",
  "amazon",
  "yahoo",
  "base",
  "own_ec",
  "other"
];
