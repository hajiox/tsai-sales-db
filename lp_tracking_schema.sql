CREATE TABLE IF NOT EXISTS lp_tracking_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  management_name TEXT NOT NULL,
  lp_url TEXT NOT NULL,
  product_value TEXT,
  meta_pixel_id TEXT,
  status TEXT DEFAULT '未実装',
  test_status TEXT DEFAULT 'テスト未',
  memo TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lp_tracking_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id UUID REFERENCES lp_tracking_targets(id) ON DELETE CASCADE,
  destination_name TEXT NOT NULL,
  destination_value TEXT,
  url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_tracking_target BOOLEAN DEFAULT true,
  is_tested BOOLEAN DEFAULT false,
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
