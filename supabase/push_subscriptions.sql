-- Push通知購読テーブル（DocScanner FAX通知用）
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT,  -- どのPC/ブラウザか識別用（任意）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLSは無効（内部API専用）
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- service_role用のポリシー（API Routes = service_role経由）
CREATE POLICY "service_role_all" ON push_subscriptions
  FOR ALL USING (true) WITH CHECK (true);
