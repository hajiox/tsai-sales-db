# 食のブランド館 決算棚卸し

2026-09-15

- `/food-store-analysis/inventory` を追加。食のブランド館分析の決算棚卸しボタン、スマホメニュー、QRから開く。
- 既存のブランド館・製造・卸棚卸しの年度別保存、8月〜翌7月の年度区分、認証制限、確定・出力の流れを参照。商品マスターの価格計算や7掛けは適用せず、取込Excelの値を使う。
- 2026年度（棚卸日2026-07-31）へ指定Excelを取込。8シート・1,001非空セル・275計算式。シート名、商品名、数値、空白、計算式、数値形式を保持。取込原本と編集用データはDBの別フィールドに保存し、更新前の全状態を履歴テーブルへ記録する。
- `合計!B7`の参照切れと、その影響を受ける`B11`は原本どおり保持する。買取在庫シートの「10％税込合計」表示に対する計算式1.08も依頼どおり変更しない。
- セル編集、保存時再計算、年度切替、既存年度を上書きしないExcel取込、翌年度複製、確定／編集再開、Excel出力、選択シート印刷に対応。翌年度複製は保存済みの文言・数量・単価を引き継ぐ。
- 対応計算式は元Excelで使用されているセル参照（シート間を含む）、掛け算、SUM範囲合計。参照切れ・未対応式・循環参照は計算エラーとして表示し、ゼロに隠さない。更新はrevision一致を要求し、古い画面の上書きを409で拒否する。
- DB: `food_store_closing_inventories`、`food_store_closing_inventory_history`。RLS有効、anon/authenticatedから直接アクセス不可。既存棚卸しと同じ認証済み管理アカウントのみAPIで操作可能。
- 検証: 原本は独立したopenpyxl抽出と件数一致。全275計算式の再計算値は原本キャッシュと一致。DB全セルroundtrip、確定ロック、履歴、API認証・競合・保存・編集再開、PC/スマホ表示のテストに合格。対象ファイルのESLintと型検査、security scan/RLS、189ページのビルドに合格。既存の無関係なTypeScriptエラーは未変更。
- 共有同期は既存共有cloneの未コミット変更により停止。既存差分に触れず、新規cloneのGitHub mainを基に実装。

検証・取込:

```powershell
node scripts/test-food-store-inventory.cjs <原本xlsx>
node scripts/import-food-store-inventory.cjs <原本xlsx> 2026 --dry-run
node scripts/import-food-store-inventory.cjs <原本xlsx> 2026 --apply
node scripts/check-food-store-inventory-ui.cjs http://localhost:3033
```

取込の再実行は同年度・同じ原本のときのみ既存データを確認し、編集内容を上書きしない。ローカルUI検証は専用の2099年度データを作成・削除する。本番URL指定時は読み取りと画面検証のみ。
