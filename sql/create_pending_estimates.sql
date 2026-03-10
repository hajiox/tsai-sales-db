-- 見積書データ連携テーブル
-- Doc Scanner → Supabase → TSA WEB
-- 見積書の明細をpending状態で保持し、人間が確認して材料マスターに反映する

CREATE TABLE IF NOT EXISTS pending_estimate_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    -- Doc Scanner側の情報
    doc_scanner_doc_id TEXT NOT NULL,
    counterparty_name TEXT,
    doc_date DATE,
    doc_number TEXT,
    total_amount DECIMAL(12,2),
    -- 明細行データ
    item_name TEXT NOT NULL,
    quantity DECIMAL(10,4),
    unit TEXT,
    unit_price DECIMAL(12,4),
    amount DECIMAL(12,2),
    tax_rate DECIMAL(5,4),
    -- 自動マッチング結果
    matched_ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
    matched_ingredient_name TEXT,
    match_confidence DECIMAL(3,2),
    -- ステータス管理
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'skipped')),
    applied_action TEXT CHECK (applied_action IN ('price_updated', 'created_new', NULL)),
    applied_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    -- メタデータ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_pending_estimate_status ON pending_estimate_items(status);
CREATE INDEX IF NOT EXISTS idx_pending_estimate_created ON pending_estimate_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_estimate_doc_id ON pending_estimate_items(doc_scanner_doc_id);

-- RLS
ALTER TABLE pending_estimate_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read all pending_estimate_items" ON pending_estimate_items FOR SELECT USING (true);
CREATE POLICY "Allow write all pending_estimate_items" ON pending_estimate_items FOR ALL USING (true);
