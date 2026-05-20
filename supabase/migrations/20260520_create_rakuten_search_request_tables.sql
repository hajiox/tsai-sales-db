-- 楽天サーチ申請: 候補除外リストと設定履歴
CREATE TABLE IF NOT EXISTS rakuten_search_exclusions (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    product_name TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rakuten_search_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rakuten_search_exclusions_all" ON rakuten_search_exclusions;
CREATE POLICY "rakuten_search_exclusions_all" ON rakuten_search_exclusions
    FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS rakuten_search_request_histories (
    id UUID PRIMARY KEY,
    title TEXT,
    item_count INTEGER NOT NULL DEFAULT 0,
    prompt TEXT NOT NULL,
    restore_prompt TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rakuten_search_request_histories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rakuten_search_request_histories_all" ON rakuten_search_request_histories;
CREATE POLICY "rakuten_search_request_histories_all" ON rakuten_search_request_histories
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rakuten_search_request_histories_created_at
    ON rakuten_search_request_histories(created_at DESC);
