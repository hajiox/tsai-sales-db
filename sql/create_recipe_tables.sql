-- レシピ管理システム テーブル作成SQL
-- TSA Sales DB Supabase用

-- 1. レシピカテゴリテーブル
CREATE TABLE IF NOT EXISTS recipe_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 材料カテゴリテーブル
CREATE TABLE IF NOT EXISTS ingredient_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 材料マスターテーブル
CREATE TABLE IF NOT EXISTS ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES ingredient_categories(id),
    name VARCHAR(200) NOT NULL,
    unit_quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    price_incl_tax DECIMAL(10,2),
    price_excl_tax DECIMAL(10,2),
    price_per_gram DECIMAL(10,6),
    calories DECIMAL(10,2),
    protein DECIMAL(10,2),
    fat DECIMAL(10,2),
    carbohydrate DECIMAL(10,2),
    sodium DECIMAL(10,2),
    supplier VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. レシピテーブル
CREATE TABLE IF NOT EXISTS recipes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES recipe_categories(id),
    name VARCHAR(200) NOT NULL,
    development_date DATE,
    selling_price_incl_tax DECIMAL(10,2),
    selling_price_excl_tax DECIMAL(10,2),
    production_quantity INTEGER DEFAULT 400,
    total_cost DECIMAL(10,2),
    unit_cost DECIMAL(10,2),
    total_weight DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'active',
    source_file VARCHAR(200),
    source_sheet VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. レシピ材料関連テーブル
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id),
    ingredient_name VARCHAR(200),
    usage_amount DECIMAL(10,4),
    calculated_cost DECIMAL(10,4),
    percentage DECIMAL(5,2),
    display_order INTEGER,
    -- 栄養成分（レシピごとに計算された値）
    calories DECIMAL(10,2),
    protein DECIMAL(10,2),
    fat DECIMAL(10,2),
    carbohydrate DECIMAL(10,2),
    sodium DECIMAL(10,2)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category_id);
CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

-- 初期カテゴリデータ挿入
INSERT INTO recipe_categories (name, description) VALUES
    ('ネット専用', 'ネット販売専用商品'),
    ('Shopee台湾', 'Shopee台湾向け商品'),
    ('霊山', '霊山工場製造商品'),
    ('季の郷湯ら里', '季の郷湯ら里向け商品'),
    ('裏磐梯', '裏磐梯向け商品'),
    ('その他', 'その他のカテゴリ')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_categories (name) VALUES
    ('肉類'),
    ('野菜・果物'),
    ('調味料'),
    ('油脂類'),
    ('粉類'),
    ('スパイス'),
    ('資材'),
    ('その他')
ON CONFLICT DO NOTHING;

-- RLSポリシー（Row Level Security）
ALTER TABLE recipe_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 全ユーザーに読み取り許可
CREATE POLICY "Allow read all" ON recipe_categories FOR SELECT USING (true);
CREATE POLICY "Allow read all" ON ingredient_categories FOR SELECT USING (true);
CREATE POLICY "Allow read all" ON ingredients FOR SELECT USING (true);
CREATE POLICY "Allow read all" ON recipes FOR SELECT USING (true);
CREATE POLICY "Allow read all" ON recipe_ingredients FOR SELECT USING (true);

-- 認証ユーザーに書き込み許可
CREATE POLICY "Allow authenticated write" ON recipe_categories FOR ALL USING (true);
CREATE POLICY "Allow authenticated write" ON ingredient_categories FOR ALL USING (true);
CREATE POLICY "Allow authenticated write" ON ingredients FOR ALL USING (true);
CREATE POLICY "Allow authenticated write" ON recipes FOR ALL USING (true);
CREATE POLICY "Allow authenticated write" ON recipe_ingredients FOR ALL USING (true);
