-- 楽天商品コード → 商品名マッピングテーブル
CREATE TABLE IF NOT EXISTS rakuten_product_names (
    product_code TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS有効化
ALTER TABLE rakuten_product_names ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み書きできるポリシー
CREATE POLICY "rakuten_product_names_all" ON rakuten_product_names
    FOR ALL USING (true) WITH CHECK (true);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_rakuten_product_names_code ON rakuten_product_names(product_code);
