-- recipe_print_logs テーブル（TSA → DocScanner 連携用）
-- TSAのレシピ印刷ボタンで書き込み、DocScannerがポーリングで取得

CREATE TABLE IF NOT EXISTS recipe_print_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id uuid NOT NULL,
  recipe_name text NOT NULL,
  category text,
  version_number integer,
  version_note text,
  items jsonb,
  total_cost real,
  selling_price real,
  printed_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_print_logs_processed ON recipe_print_logs(processed);
CREATE INDEX IF NOT EXISTS idx_recipe_print_logs_created ON recipe_print_logs(created_at);

-- RLSを無効化（service_role keyで操作するため）
ALTER TABLE recipe_print_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all with service role" ON recipe_print_logs FOR ALL USING (true);
