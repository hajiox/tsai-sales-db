-- Meta広告パフォーマンスデータ保存テーブル
CREATE TABLE IF NOT EXISTS meta_ads_performance (
    id BIGSERIAL PRIMARY KEY,
    report_month TEXT NOT NULL,          -- '2026-02' 形式
    campaign_name TEXT NOT NULL,
    ad_set_name TEXT NOT NULL,
    delivery TEXT,                        -- 配信状態
    results NUMERIC DEFAULT 0,
    cost_per_result NUMERIC DEFAULT 0,
    amount_spent NUMERIC DEFAULT 0,       -- 消化金額
    impressions INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    frequency NUMERIC DEFAULT 0,
    cpm NUMERIC DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    link_clicks INTEGER DEFAULT 0,
    ctr NUMERIC DEFAULT 0,
    cpc NUMERIC DEFAULT 0,
    -- シリーズ紐付け
    series_code INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(report_month, campaign_name, ad_set_name)
);

-- RLSポリシー
ALTER TABLE meta_ads_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON meta_ads_performance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read" ON meta_ads_performance FOR SELECT TO anon USING (true);

-- インデックス
CREATE INDEX idx_meta_ads_month ON meta_ads_performance(report_month);
CREATE INDEX idx_meta_ads_series ON meta_ads_performance(series_code);
