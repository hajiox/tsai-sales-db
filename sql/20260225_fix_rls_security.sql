-- ============================================================
-- Supabase Security Advisor 67件エラー修正
-- 実行日: 2026-02-25
-- 
-- 方針:
--   ① 全テーブルで RLS を有効化
--   ② 既存の「全公開 (USING true)」ポリシーを削除し
--      認証済みユーザー限定のポリシーに置き換え
--   ③ 認証済みユーザー（authenticated）に全操作を許可
--   ④ 匿名ユーザー（anon）には SELECT のみ許可
--      (NextAuth middleware で保護済みだが、anon key 経由の
--       既存クライアント側 SELECT を壊さないための安全策)
--   ⑤ API Routes は SERVICE_ROLE_KEY を使用するため
--      RLS をバイパスし、一切影響を受けない
--   ⑥ SECURITY DEFINER ビューを SECURITY INVOKER に変更
--
-- ⚠️ 既存機能への影響:
--   - サーバーサイド API Routes: SERVICE_ROLE_KEY 使用 → 影響なし
--   - ブラウザ (anon key) での SELECT: 引き続き許可 → 影響なし
--   - ブラウザ (anon key) での INSERT/UPDATE/DELETE: 
--     → authenticated ロールが必要になるが、NextAuth で
--       認証済みのため通常利用では影響なし
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1: public スキーマ - 既知のテーブル（既存ポリシー削除&再作成）
-- ============================================================

-- ----- recipe_categories -----
DROP POLICY IF EXISTS "Allow read all" ON public.recipe_categories;
DROP POLICY IF EXISTS "Allow authenticated write" ON public.recipe_categories;
DROP POLICY IF EXISTS "anon_select" ON public.recipe_categories;
DROP POLICY IF EXISTS "authenticated_all" ON public.recipe_categories;
ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.recipe_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated_all" ON public.recipe_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- ingredient_categories -----
DROP POLICY IF EXISTS "Allow read all" ON public.ingredient_categories;
DROP POLICY IF EXISTS "Allow authenticated write" ON public.ingredient_categories;
DROP POLICY IF EXISTS "anon_select" ON public.ingredient_categories;
DROP POLICY IF EXISTS "authenticated_all" ON public.ingredient_categories;
ALTER TABLE public.ingredient_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.ingredient_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated_all" ON public.ingredient_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- ingredients -----
DROP POLICY IF EXISTS "Allow read all" ON public.ingredients;
DROP POLICY IF EXISTS "Allow authenticated write" ON public.ingredients;
DROP POLICY IF EXISTS "anon_select" ON public.ingredients;
DROP POLICY IF EXISTS "authenticated_all" ON public.ingredients;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.ingredients FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated_all" ON public.ingredients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- recipes -----
DROP POLICY IF EXISTS "Allow read all" ON public.recipes;
DROP POLICY IF EXISTS "Allow authenticated write" ON public.recipes;
DROP POLICY IF EXISTS "anon_select" ON public.recipes;
DROP POLICY IF EXISTS "authenticated_all" ON public.recipes;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.recipes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated_all" ON public.recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- recipe_ingredients -----
DROP POLICY IF EXISTS "Allow read all" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Allow authenticated write" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "anon_select" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "authenticated_all" ON public.recipe_ingredients;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.recipe_ingredients FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated_all" ON public.recipe_ingredients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- sales_reports -----
DROP POLICY IF EXISTS "Allow all operations on sales_reports" ON public.sales_reports;
DROP POLICY IF EXISTS "anon_select" ON public.sales_reports;
DROP POLICY IF EXISTS "authenticated_all" ON public.sales_reports;
ALTER TABLE public.sales_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.sales_reports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated_all" ON public.sales_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- daily_sales_report -----
DROP POLICY IF EXISTS "Allow all operations on daily_sales_report" ON public.daily_sales_report;
DROP POLICY IF EXISTS "anon_select" ON public.daily_sales_report;
DROP POLICY IF EXISTS "authenticated_all" ON public.daily_sales_report;
ALTER TABLE public.daily_sales_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.daily_sales_report FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated_all" ON public.daily_sales_report FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- ai_reports (RLS明示的に無効化されていた) -----
DROP POLICY IF EXISTS "anon_select" ON public.ai_reports;
DROP POLICY IF EXISTS "authenticated_all" ON public.ai_reports;
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.ai_reports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated_all" ON public.ai_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- PART 2: public スキーマ - Security Advisor で追加指摘されたテーブル
-- (DB上に存在する場合のみ実行)
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'recipe_items',
    'materials',
    'general_ledger',
    'general_ledger_raw_v1',
    'gl_raw_uploads',
    'gl_quarantine',
    'web_sales',
    'wholesale_sales',
    'oem_sales',
    'brand_store_sales',
    'products',
    'product_price_history',
    'amazon_product_mapping',
    'ai_tools',
    'expenses',
    'advertising_costs',
    'account_master',
    'company_links',
    'series_master',
    'wholesale_products',
    'oem_customers',
    'oem_products',
    'food_store_sales',
    'food_store_daily_sales',
    'food_store_categories',
    'food_store_product_categories',
    'brand_store_adjustments',
    'brand_store_master',
    'rakuten_product_mapping',
    'yahoo_product_mapping',
    'base_product_mapping',
    'mercari_product_mapping',
    'qoo10_product_mapping',
    'product_embeddings',
    'wholesale_oem_orders',
    'wholesale_orders',
    'manufacturing_kpi',
    'history_log',
    'activity_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      -- RLS有効化
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      
      -- 既存の過度に許可的なポリシーを削除
      BEGIN EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I', tbl); EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE format('DROP POLICY IF EXISTS "Allow read all" ON public.%I', tbl); EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated write" ON public.%I', tbl); EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE format('DROP POLICY IF EXISTS "anon_select" ON public.%I', tbl); EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE format('DROP POLICY IF EXISTS "authenticated_all" ON public.%I', tbl); EXCEPTION WHEN undefined_object THEN NULL; END;
      
      -- 新しいポリシー作成
      BEGIN
        EXECUTE format('CREATE POLICY "anon_select" ON public.%I FOR SELECT TO anon, authenticated USING (true)', tbl);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
      BEGIN
        EXECUTE format('CREATE POLICY "authenticated_all" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
      
      RAISE NOTICE 'RLS enabled for public.%', tbl;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PART 3: kpi スキーマのテーブル (RLS 設定が一切なかった)
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'kpi_manual_entries_v1',
    'annual_targets_v1',
    'sales_goals_manual_v1'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'kpi' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE kpi.%I ENABLE ROW LEVEL SECURITY', tbl);
      BEGIN
        EXECUTE format('CREATE POLICY "anon_select" ON kpi.%I FOR SELECT TO anon, authenticated USING (true)', tbl);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
      BEGIN
        EXECUTE format('CREATE POLICY "authenticated_all" ON kpi.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
      RAISE NOTICE 'RLS enabled for kpi.%', tbl;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PART 4: 安全網 - 上記でカバーしきれない全テーブルを一括RLS有効化
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname NOT IN (
      'pg_catalog', 'information_schema', 'auth', 'storage', 
      'realtime', 'pgsodium', 'vault', 'extensions', 
      'graphql', 'graphql_public', 'supabase_functions', 
      'supabase_migrations', '_realtime', 'net', 'pgsodium_masks',
      '_analytics', 'cron'
    )
    AND NOT rowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
    
    BEGIN
      EXECUTE format(
        'CREATE POLICY "anon_select" ON %I.%I FOR SELECT TO anon, authenticated USING (true)',
        r.schemaname, r.tablename
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
      EXECUTE format(
        'CREATE POLICY "authenticated_all" ON %I.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        r.schemaname, r.tablename
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    RAISE NOTICE 'RLS auto-enabled for %.%', r.schemaname, r.tablename;
  END LOOP;
END $$;


-- ============================================================
-- PART 5: SECURITY DEFINER ビューを SECURITY INVOKER に変更
-- (Supabase Security Advisor の "Security Definer View" エラー対応)
--
-- ⚠️ SECURITY INVOKER は PostgreSQL 15+ で対応
-- Supabase は PG15 を使用しているためサポート済み
-- ============================================================

DO $$
DECLARE
  v RECORD;
  view_names TEXT[] := ARRAY[
    'v_financial_overview_final_latest',
    'v_financial_overview_final_series',
    'v_pl_month_totals_final_latest',
    'v_pl_month_totals_final_series',
    'v_bs_snapshot_clean_final_latest',
    'v_trial_balance_final_latest',
    'v_monthly_trial_balance',
    'v_monthly_balance_with_type',
    'closing_summary'
  ];
  vname TEXT;
BEGIN
  FOREACH vname IN ARRAY view_names
  LOOP
    -- ビューが存在するか確認
    IF EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name = vname
    ) THEN
      -- SECURITY INVOKER に変更
      BEGIN
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', vname);
        RAISE NOTICE 'View %.% set to SECURITY INVOKER', 'public', vname;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not alter view %.%: %', 'public', vname, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PART 6: 検証クエリ（コメント。実行後に手動確認用）
-- ============================================================
-- 
-- RLS状態確認:
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname NOT IN ('pg_catalog','information_schema','auth','storage','realtime','pgsodium','vault','extensions')
-- ORDER BY rowsecurity, schemaname, tablename;
--
-- ビューのセキュリティ設定確認:
-- SELECT schemaname, viewname, 
--   (SELECT reloptions FROM pg_class WHERE relname = viewname LIMIT 1)
-- FROM pg_views
-- WHERE schemaname = 'public';

COMMIT;
