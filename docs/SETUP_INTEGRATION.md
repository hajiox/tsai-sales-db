
# データ統合・クレンジング機能のセットアップ手順

## 1. データベースの更新
この機能を使用するには、まずデータベースに新しいカラム（紐付け用ID）を追加する必要があります。
以下のSQLをSupabaseダッシュボードの SQL Editor で実行してください。

```sql
-- 1. レシピアイテムテーブルに紐付け用のIDカラムを追加
ALTER TABLE recipe_items 
ADD COLUMN IF NOT EXISTS ingredient_id UUID REFERENCES ingredients(id),
ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES materials(id),
ADD COLUMN IF NOT EXISTS intermediate_recipe_id UUID REFERENCES recipes(id);

-- 2. パフォーマンス向上のためのインデックス作成
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient_id ON recipe_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_material_id ON recipe_items(material_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_intermediate_recipe_id ON recipe_items(intermediate_recipe_id);
```

## 2. 機能の利用方法
1. レシピ一覧画面に新しく追加された「データ統合」ボタンをクリックします。
2. 「未紐付けアイテム一覧」が表示されます。これはExcelから取り込まれた文字列のみのアイテムです。
3. リストの各行にある「マスタを選択...」ボタンをクリックし、正しいマスタ（食材、資材、または中間部品レシピ）を探して選択します。
4. 「統合」ボタンを押すと、システム内の**同じ名前のすべてのアイテム**が一括で更新され、IDで紐付けられます。
5. ID紐付け後は、アイテム名の変更や価格改定などが自動的に反映されるようになり、「使用されている商品」も正確に表示されるようになります。

## 注意事項
- 一度統合を行うと、元のアイテム名はマスタの名前に上書きされます。
- 間違って統合した場合は、手動で修正するか、再度統合画面で正しいマスタを選び直す必要があります（ただし、名前が変わってしまっているため、個別に修正するのは少し大変かもしれません）。慎重に行ってください。
