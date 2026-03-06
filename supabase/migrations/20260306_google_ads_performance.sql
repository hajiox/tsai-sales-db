-- Google Ads パフォーマンスデータテーブル
-- アセットグループ別の日次パフォーマンスデータを保存

CREATE TABLE IF NOT EXISTS google_ads_performance (
  id BIGSERIAL PRIMARY KEY,
  campaign_name TEXT NOT NULL,
  asset_group_name TEXT NOT NULL,
  asset_group_status TEXT,
  report_date DATE NOT NULL,
  cost_micros BIGINT DEFAULT 0,        -- 費用（マイクロ単位、1,000,000 = 1円）
  cost NUMERIC(12,2) GENERATED ALWAYS AS (cost_micros / 1000000.0) STORED, -- 費用（円）
  impressions INTEGER DEFAULT 0,        -- 表示回数
  clicks INTEGER DEFAULT 0,             -- クリック数
  conversions NUMERIC(10,2) DEFAULT 0,  -- コンバージョン数
  conversions_value NUMERIC(12,2) DEFAULT 0, -- コンバージョン値
  series_code INTEGER,                  -- 紐付けるシリーズコード（手動マッピング可）
  synced_at TIMESTAMPTZ DEFAULT NOW(),  -- 同期日時
  UNIQUE(campaign_name, asset_group_name, report_date)
);

-- アセットグループ → シリーズコード マッピングテーブル
CREATE TABLE IF NOT EXISTS google_ads_series_mapping (
  id SERIAL PRIMARY KEY,
  asset_group_name TEXT NOT NULL UNIQUE,
  series_code INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_google_ads_perf_date ON google_ads_performance(report_date);
CREATE INDEX IF NOT EXISTS idx_google_ads_perf_campaign ON google_ads_performance(campaign_name);
CREATE INDEX IF NOT EXISTS idx_google_ads_perf_series ON google_ads_performance(series_code);
CREATE INDEX IF NOT EXISTS idx_google_ads_perf_sync ON google_ads_performance(synced_at);

-- 月次集計ビュー（advertising_costsへの自動反映用）
CREATE OR REPLACE VIEW google_ads_monthly_summary AS
SELECT
  series_code,
  DATE_TRUNC('month', report_date)::DATE AS report_month,
  SUM(cost_micros) AS total_cost_micros,
  ROUND(SUM(cost_micros) / 1000000.0) AS total_cost,
  SUM(impressions) AS total_impressions,
  SUM(clicks) AS total_clicks,
  SUM(conversions) AS total_conversions,
  SUM(conversions_value) AS total_conversions_value,
  CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(cost_micros) / 1000000.0 / SUM(clicks)) ELSE 0 END AS cpc,
  CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::NUMERIC / SUM(impressions) * 100, 2) ELSE 0 END AS ctr,
  CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(conversions) / SUM(clicks) * 100, 2) ELSE 0 END AS cvr
FROM google_ads_performance
WHERE series_code IS NOT NULL
GROUP BY series_code, DATE_TRUNC('month', report_date);
