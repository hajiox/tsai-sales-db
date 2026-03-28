# レシピシステム開発 (TSA開発ログ)

## 概要
レシピデータの同期、食材（水）のマスター統合、重量原価の自動計算、および本番環境へのデプロイ管理。

## 1. プロジェクト概要
本プロジェクトは、従来Vercel上でブラウザベースで開発されていた販売管理KPI分析システムを、ローカル環境（C:\作業用\tsai-sales-db）で開発運用できるように環境構築を行ったものです。
DBはSupabase、AI分析にはGoogle Gemini API、認証にはNextAuth.js（Google認証）を使用しています。

- **本番環境:** Vercel（https://v0-tsa-19.vercel.app） — GitHub mainブランチへのpushで自動デプロイ
- **テスト環境:** localhost:3001（PM2管理） — ローカル検証専用、本番ではない
- **デプロイ手順:** `git add . && git commit && git push` → Vercelが自動ビルド・デプロイ

## 2. 開発履歴
(省略...)

### 2026-03-28 見積書作成UIの刷新およびユーザビリティ強化 (doc-scanner連携)
- 見積作成画面および編集画面のUIを、1商品1ブロックごとのカード型レイアウトに全面変更。
- 詳細情報の表示（JAN、賞味期限など）に加え、新たに「備考欄」の印字可否トグル（`show_remarks`）と複数行入力を実装。
- 商品追加エリアに自社・OEM・ネット・試作などカテゴリ別タブ検索機能を追加。
- 画面切り替え時に見積作成中であっても、最新のレシピ修正が同期・補完される自動更新ルーチンを実装。
- カード内からレシピページ（localhost:3001等）へ直接飛べるダイレクトリンクボタンを設置。
- 印刷画面（`/print`）にて、`show_remarks` フラグによる個別備考の印字・非印字コントロールを正確に反映するように改善。

### 2026-02-17 17:29:27 ウマーボー丼のデータ修正
- Excelスクリーンショットに基づき「生姜(煮済み)」および「山椒パウダー」を追加
- 全ての材料の分量をExcelと100%一致するように同期
- 重量を再計算し本番環境へデプロイ


### 2026-02-17 17:55:17 全レシピの材料数分量の一括同期
- Excel（自社OEMネット）全45シート以上の材料データをDBと完全同期
- 不足していた中身のないレシピ（牛バラカレー、大噴火カレー等）に材料25〜29件を自動追加
- 全てのレシピの重量をExcel実数に基づき再計算
- 本番環境へデプロイ


### 2026-02-17 18:01:10 レシピ詳細画面のレイアウト修正
- コンテナの最大幅をA4サイズ(210mm)から1400pxへ拡大
- 材料名（名称）カラムの最小幅を320pxへ拡張し、長い名称が途切れないように修正
- テーブルレイアウトを固定幅から自動調整に変更し、大画面での視認性を向上


### 2026-02-17 18:25:10 レシピデータ完全同期(221シート)
- 自社OEMネット専用の3ファイル、全221シートを走査
- 219件のレシピデータを完全同期（材料の追加更新削除重量再計算）
- マッチングロジック改善: 部分一致使用済みID除外で重複回避
- DB上の全レシピの材料数がExcelとほぼ完全一致


### 2026-02-18 17:34:00 Amazon手数料の諸経費からの分離
- recipesテーブルに`amazon_fee_enabled`カラム（BOOLEAN, DEFAULT false）を追加
- レシピ詳細ページにAmazon手数料のON/OFFトグルスイッチを追加
- ON時: 販売価格 x Amazon手数料率(%)が自動計算され原価に加算
- 原価内訳表示（材料資材経費 / Amazon手数料）を追加
- 諸経費に含まれていた旧「Amazon手数料」アイテムを計算から除外するロジック追加
- 保存時にamazon_fee_enabledフラグをDBに保存


### 2026-02-19 17:14:00 原材料ラベルAI生成機能の実装
- 商品詳細ページに「原材料名」インライン表示エリアを追加（幅420px）
- Gemini AIによる原材料表示テキストの自動生成（重量順、複合原材料、添加物、アレルゲン）
- 生成結果の編集・保存・削除機能（ゴミ箱アイコン）
- レシピ内食材名とDB正式名の「表記ゆれ」に対応するため、正規化とファジーマッチングを導入
- **更新時の誤操作防止:** ラベルインポート機能において、既存データの名前（Name）を上書きしないようデフォルト選択解除


### 2026-02-19 17:55:00 安全性強化：AI推測補完の禁止
- レシピ内に原材料データ未登録の複合原材料（例: 「二郎麺」「～ソース」）が含まれる場合、AIが勝手に成分を推測して出力する事故を防ぐため、プロンプトを厳格化
- **「推測禁止」** と明記し、代わりに `【要確認: 〇〇】` というプレースホルダーを出力
- 麺、パン、ハム、ソース等のキーワードに基づき、データ不足を検知して警告を表示
- 食品表示事故（正しいアレルゲンが表示されない等）の防止を最優先


### 2026-02-20 08:21:00 開発ドキュメント更新・完了
- 全体開発.md および TSA開発.md を最新の状況に合わせて更新
- 機能追加および修正点の記録完了


### 2026-02-20 10:00:00 Excel vs DB 全数データ検証・修正
- 全5Excelファイル（282シート）と DB全366レシピ（4,709アイテム）を完全照合
- Supabase API 1000件制限をページネーションで回避し、全データを正確に取得
- **修正済みバグ（計5件）:**
  1. **南会津産トマトと赤ワインのキーマカレー（通常版）**: 全16材料のusage_amountが1kg業務用版の値（5.7倍）になっていた → Excel正値に修正
  2. **南会津産トマトと赤ワインのキーマカレー（1kg版）**: 全16材料のusage_amountが初期値1のままだった → Excel正値に修正
  3. **桃バター 香料（桃）**: usage_amountが10倍ズレ（1.1→0.11） → 修正
  4. **つけ麺スープ / つけ麺スープ（極にぼ）**: 3材料（粉粉豚骨、ヤマヒデ本ぶし粉、煮干しパウダー）のデータが2レシピ間で入れ替わっていた → 修正
  5. **喜多方背脂2食**: 6食版の値が入っていた → 修正（前回対応済み）
- **配合差異の修正（15件）:** なみえ豚カレー、辛すぎInspire零、ももの葉茶4個セット、えちご家3個、ウニふりかけ、豚角煮、蕎麦ふりかけ等のusage_amountをExcel値に統一
- total_weightも連動して再計算・更新


### 2026-02-20 10:15:00 サイドバーのアクティブ状態視認性修正
- **問題:** 選択中のシステム名が白背景＋白文字で読めなかった（shadcn/ui `variant="secondary"` + `text-white` クラスの競合）
- **修正:** `variant="secondary"` を廃止し、アクティブ時は `bg-slate-600 text-white font-semibold`、非アクティブ時は `text-slate-200` で明確に区別
- **ファイル:** `components/main-sidebar.tsx`


### 2026-02-20 17:00:00 WEB販売ダッシュボード ホバーツールチップ修正
- **問題1（サマリーカード）:** 総合計・ECサイト別・シリーズ別カードのホバーツールチップにトレンドデータが表示されなかった
  - **原因:** `get_total_trend_data`, `get_site_trend_data`, `get_series_trend_data` の各DB関数が `generate_series` と `LEFT JOIN` + `WHERE` で実質 `INNER JOIN` になっていた。また `tiktok_count` カラムが9月以前のデータで `NULL` のまま → `SUM` が全体 `NULL` に
  - **修正:** 全3関数を `months` CTE + 純粋な `LEFT JOIN` に再構築、`COALESCE(ws.tiktok_count, 0)` 追加。古い3143行の `tiktok_count = NULL` を `0` に `UPDATE`
- **問題2（データテーブル・ECサイト別セル）:** ECサイトセルのホバーでRPCエラー
  - **原因1:** `getCurrentMonth()` が `"YYYY-MM-01"` を返すが、DB関数 `get_product_site_trend_data(text)` が内部で `|| '-01'` → `"YYYY-MM-01-01"` で日付パースエラー
  - **原因2:** フロントエンドが `site.key`（`"amazon_count"`）をそのままDB関数に渡すが、DB関数が内部で `|| '_count'` → `"amazon_count_count"` という不正カラム名
  - **修正:** `_count` をRPC呼び出し前に除去、`target_month` を `"YYYY-MM"` 形式に統一
- **問題3（データテーブル・ECサイト別セル - stateキー不一致）:** ツールチップに「- undefined」が表示
  - **原因:** `hoveredSiteCell` = `"uuid-amazon_count"` だが `siteTrendData` のキーが `"uuid-amazon"` で不一致
  - **修正:** `fetchSiteTrendData` 内部でstateキーを `siteKey`（`_count`付き）で統一し、RPCにのみ除去した値を渡す
- **問題4（データテーブル・商品名）:** 商品名ホバーでツールチップが表示されない
  - **原因:** `get_product_trend_data` が `date` 型引数を受け取るが、フロントから文字列を渡しておりSupabase RPC型不一致でサイレントエラー
  - **修正:** DB関数を `text` 型引数に変更（他の関数と統一）、`getCurrentMonth()` を `"YYYY-MM"` 形式に変更
- **ファイル:**
  - `components/WebSalesDataTable.tsx` — フロント側のホバー処理・RPC呼び出し修正
  - `components/websales-summary-cards.tsx` — サマリーカードのトレンド取得
  - DB関数: `get_total_trend_data`, `get_site_trend_data`, `get_series_trend_data`, `get_product_trend_data`, `get_product_site_trend_data`


### 2026-02-22 15:49:00 広告用顧客リストCSVエクスポート機能（ヤマト出荷データ管理システム）
- Google Ads カスタマーマッチ / Meta カスタムオーディエンス用CSVエクスポート機能を実装
- **バックエンドAPI** (`yamato-analytics/app/api/export/route.ts`):
  - 電話番号を国内形式からE.164形式に変換（Google: `+81xxx` / Meta: `81xxx`）
  - 日本語姓名分割ロジック（スペース区切り対応 + 漢字名2文字姓推定）
  - `ignored_customers`テーブルの除外顧客を自動フィルタ
  - 購入回数3回/5回/10回以上の抽出条件に対応
- **フロントエンドUI** (`yamato-analytics/app/page.tsx`):
  - ロイヤル顧客分析セクション直下にエクスポートUIを追加
  - Google Ads / Meta の2カラムレイアウト、各3つのダウンロードボタン
  - 対象顧客数をボタンに動的表示（3回以上: 10,499人 / 5回以上: 3,979人 / 10回以上: 874人）
- **CSV仕様**:
  - Google: `Email, Phone(E.164), First Name, Last Name, Country, Zip`
  - Meta: `email, phone, fn, ln, ct, zip, value(LTV), currency`
- **注意**: Email列はDBにデータがないため空欄、MetaのLTV(value)は購入回数で代替


### 2026-02-23 17:00:00 ギフト注文者CSVエクスポート機能（ヤマト出荷データ管理システム）
- 備考欄「〇〇様ご依頼分」からギフト依頼者名を正規表現で抽出し、広告用リストとしてCSVエクスポートする機能を追加
- **データ分析結果:** 伝票10,653件 / ユニーク依頼者6,958人 / 2回以上リピーター1,440人
- **バックエンドAPI:**
  - `app/api/export/route.ts` に `type=gift` パラメータ対応を追加
  - `extractRequesterName()` 関数で備考から依頼者名を抽出
  - 依頼者名を正規化してグループ化、ギフト回数をカウント
  - `minOrders=1`（全体）/ `minOrders=2`（2回以上）でフィルタ
  - ギフト主の電話番号はDBに存在しないため、Phone列は空欄で出力
- **新規API:** `app/api/gift-stats/route.ts` — 依頼者総数と2回以上利用者数を返す
- **フロントエンドUI:** エクスポートセクションを「👥 リピーター顧客」と「🎁 ギフト注文者」に分離、ピンク色ボタンで視覚的に区別


### 2026-02-25 18:30:00 ECサイトインポートAPI修正・商品データ整備

#### インポートAPI全EC対応修正
- **全API共通:** `products` テーブル取得クエリに `.eq('is_hidden', false)` を追加し、終売商品をマッチング対象から除外
  - 対象ファイル: `amazon-parse`, `rakuten-parse`, `yahoo-parse`, `mercari-parse`, `base-parse`, `qoo10-parse` の全6API
- **BASE API (`base-parse`):**
  - クーポン行（「クーポン」を含む・「割引」で始まる商品名）をインポート時にスキップ
- **メルカリ集計API (`aggregate/mercari-csv`):**
  - リクエスト形式を `multipart/form-data` → JSON (`{ csvContent }`) に変更（フォーマット不一致による500エラーを修正）
- **csvHelpers.ts `normalizeTitle()`:**
  - `<br>` 等のHTMLタグを空白に変換してから正規化（楽天商品名の `<br>` 混入対策）
  - HTMLエンティティ（`&nbsp;` 等）も除去

#### マッチング精度テスト結果（修正後）
| EC | マッチ | 未マッチ |
|----|--------|---------|
| Amazon | 78/80 | 2件（極長商品名） |
| 楽天 | 87/90 | 3件（極長商品名） |
| Yahoo | 76/80 | 4件（業務用・ギフト系） |
| メルカリ | ✅ 正常動作 | — |
| BASE | ✅ 正常動作 | — |
| Qoo10 | ✅ 正常動作 | — |

#### 商品データ整備（DB直接操作）
- **状況:** スタッフが商品名変更（1Kg→800g）を誤って新規登録で対応してしまい、2レコードが重複
- **旧商品 (b9671a5c):** `チャーシュー 訳あり ～訳アリ1Kg 小分け200g×5個セット`
- **誤登録 (19b8abc6):** `ラーメン屋が作る本物のチャーシュー 訳あり 個包装 200ｇ×4個 800g`
- **対処:**
  1. 旧商品の名前を `チャーシュー 訳あり ～訳アリ800g 小分け200g×4個セット` にリネーム
  2. 誤登録商品に紐付いていたレシピ(1件)・売上データ(2件・1ヶ月分はマージ)・price_history・yahoo_product_mapping を旧商品IDに付け替え
  3. 誤登録商品を完全削除
- **結果:** IDが変わっていないため過去31ヶ月分の売上・学習マッピング・レシピが全て連続して参照可能


### 2026-02-26 09:00:00 レシピ管理機能の全面修正（RLSバイパス・重複削除・原価計算）

#### RLSバイパスのためのAPI移行
- **問題:** フロントエンドからの直接Supabase書き込みがRow Level Security (RLS)で無言ブロックされ、レシピのコピー・削除・保存・データベース更新が全て失敗していた
- **解決:** 全書き込み操作を`service_role_key`を使用するバックエンドAPI経由に移行

**新規API:**
| API | メソッド | 用途 |
|-----|---------|------|
| `/api/recipe/update` | PATCH/POST | レシピフィールド更新・複製 |
| `/api/recipe/save` | POST | レシピ詳細の保存（アイテム追加/更新/削除 + メタデータ + WEB販売商品同期） |
| `/api/recipe/db-write` | POST | 汎用テーブル書き込み（ingredients/materials/expenses の insert/update/delete） |

**移行対象:** `recipe/page.tsx`, `recipe/[id]/page.tsx`, `recipe/database/page.tsx`, `recipe/ingredients/page.tsx` の全書き込み操作

#### 資材・諸経費の原価計算修正
- **問題1:** 資材・諸経費セクションに使用量入力欄がなく、常に`-`表示 → 修正: 使用量入力欄を全タイプで表示
- **問題2:** 資材の`unit_quantity`がDB上で文字列型、parseFloat失敗→コスト計算スキップ → 修正: マスター読み込み時に数値変換
- **問題3（根本原因）:** 資材の`price`は1個あたりの単価なのに、食材と同じ`usage × (price / unit_quantity)`で計算→¥0に → 修正: 資材・経費は`usage × price`、食材は`usage × (price / unit_quantity)`に分岐
- **問題4:** 資材の400個分・800個分バッチ表示が`-`だった → 「個」単位で表示に修正

#### 材料データベースのテーブル間移動機能
- 資材テーブルの各行に「→諸経費」ボタン、諸経費テーブルの各行に「→資材」ボタンを追加
- プルダウンUI改善（幅320px→500px、候補名の全文表示）
- レシピ詳細の編集モードにアイテムタイプ変更セレクトを追加


### 2026-02-27 レシピ原価照合・中間部品データ整備・UI改善

#### Excel-DB原価照合の完全実施
- Excel全シートとDB全レシピの原価率を照合、PDF変換後のデータ検証を含む大規模データ整合性作業
- レシピ名70件をExcelシート名に合わせてリネーム、重複レシピ6件を削除、新規レシピ35件をExcelから自動登録
- 資材・諸経費セクションのパース改善（セル結合・カラム位置ずれ対応）
- 最終結果: 91/329レシピで>20%差異→46レシピに改善（うち34件はDB>Excelで正常、残12件は要調査）

#### 中間部品の全面データ修正
- **ゴミデータ削除（6件）:** 手順テキスト（「ぬるま湯でほぐしながら洗う」等）やセクションヘッダーが食材として誤登録されていた問題を修正
- **分類修正（7件）:** 包装資材（レトルト袋、タレビン、ナイロンポリ等）がingredientとして登録→materialに変更
- **中間部品アイテム完全再構築（30件）:** 全中間部品のアイテムを削除→Excelから正確にパースして再登録
- **重複中間部品削除（8件）:** 【P】プレフィックス付きと無しの重複レシピを統合
- **誤intermediate修正（7件）:** えちご家、トマトドレッシング、りんご茶、牛バラカレー等のis_intermediate→falseに修正

#### 諸経費分類の一括修正（231件）
- 水道光熱費(108件)、内職(68件)、発送用ダンボール(54件)等がmaterialに誤分類→expenseに一括修正

#### Amazon手数料のレシピアイテムからの完全削除（121件）
- Amazon手数料は材料データベースの一括税率設定（トグルスイッチ方式）で管理する方針に統一

#### fetchIntermediateUsage クエリ最適化
- レシピ一覧ページで中間加工品使用先取得のクエリがSupabase行数制限でエラー→クエリロジックを最適化

#### レシピ詳細ページに原価小計行の追加
- 中間加工品セクション後に「原価小計 (セット内容 + 原材料 + 中間加工品)」（緑色）を表示
- 諸経費セクション後に「原価小計 (資材・包材 + 諸経費)」（オレンジ色）を表示
- **ファイル:** `app/recipe/[id]/page.tsx`


### 2026-03-03 JPG vs DB レシピ全数照合・データ修正（自社＋OEM）

#### 自社レシピ照合・修正（43件の変更、7レシピ）
- Excel(PDF→JPG変換)とDBの全レシピを照合するスクリプトを作成・実行
- **蕎麦ふりかけ**: 誤登録された食材3件・資材4件を削除
- **トマトドレッシング**: 不足資材3件・経費1件を追加
- **喜多方ラーメンふりかけ**: 不足資材1件・経費1件を追加
- **CANP牛バラカレー・CANP豚角煮カレー**: 不足資材・経費を追加
- **悪魔のBUTAカレー**: unit_price/cost値を修正
- **ラッキーカレー**: unit_price/cost値を修正

#### OEMレシピ照合・修正（29件の変更）
- OEM 49レシピとExcel 25シートを照合するスクリプトを作成・実行
- **OEM製造費 25件**: `material`→`expense`に分類変更（JPGでは全て経費欄に記載）
- **Re-Hcapキャップ 2件**: `ingredient`→`material`に分類変更
- **Re-Hcapキャップ 2件**: 単価 `null`→`9.24` に修正
- 照合結果: 完全一致 5→11件に改善

#### 自社レシピ経費一括修正（57件）
- **卸商品発送人件費 32件**: 全自社レシピから削除
- **内職13円→12円 25件**: 名称・単価・原価を一括更新

#### レシピ管理画面UI整理
- 「データ統合」「Excelインポート」「重複チェック」の3ボタンを削除
- 未使用インポート（`Merge`）をクリーンアップ
- **ファイル:** `app/recipe/page.tsx`


### 2026-03-03〜04 KPIダッシュボード大規模改修

#### 印刷レイアウトの完全再構築
- **4案から選択:** 印刷専用テーブル方式を採用（画面表示は既存ママ）
- **部門別テーブル:** `rowSpan` と `table-fixed` で部門名・内訳列を完全整列
- **上期/下期分割:** 12ヶ月を6ヶ月×2テーブルでA4横収まりに
- **営業活動・製造数テーブル:** メインテーブルと同じ列幅で統一
- **前年度対比表示条件修正:** `r.actual > 0 && r.lastYear > 0` → `r.lastYear > 0` に変更、未入力月でも前年データがあれば0%表示

#### サマリーカードの拡張（5列化）
- **前年度売上合計カード追加:** FY前年度の売上合計 + 前年度対比（%）+ 前々年実績を表示
- **AI年度末売上予測カード追加:** Gemini 2.0 Flash APIで年度末着地予想を生成
  - `/api/kpi/ai-forecast` エンドポイント新設
  - 月次実績（前年・目標・実績）+ チャネル別データをGeminiに渡し予測
  - 予測結果は `localStorage` に保存（次のボタン押下まで保持）
  - 紫グラデーション背景で視覚的に区別
- **グリッド:** `lg:grid-cols-4` → `lg:grid-cols-5`
- **テーブルはみ出し修正:** `overflow-x-auto` + `min-w-[900px]` 追加

#### 営業活動実績の前年度データ追加
- **データモデル:** `salesActivity` に `lastYear` フィールドを追加（`actions.ts`）
- **DB投入:** FY2025の営業活動実績（12ヶ月分: 49,31,24,26,13,13,9,9,49,11,9,32）を `kpi_manual_entries_v1` に登録
- **UI追加:** 前年度実績行（テーブル最上段）+ 前年度対比行（テーブル最下段）+ 合計列

#### 関連ファイル
| ファイル | 変更内容 |
|---------|---------|
| `app/kpi/actions.ts` | salesActivity に lastYear フィールド追加、前年同月データ取得 |
| `components/kpi/KpiPageClient.tsx` | 印刷テーブル再構築、サマリーカード5列化、前年度カード・AI予測カード追加、営業活動に前年度実績・対比行追加 |
| `app/api/kpi/ai-forecast/route.ts` | Gemini 2.0 Flash による年度末売上予測API（新規） |
| `app/globals.css` | 印刷用スタイル追加 |




### 2026-03-04~05 WEB/卸販売 単価スナップショット改修・BASE CSVインポート修正

#### WEB販売管理 — 商品価格変更時の処理改善
- **問題:** 商品価格変更時、過去月の売上データも最新価格で再計算されてしまう
- **修正:** `web_sales_summary` に `unit_price` カラムを追加し、インポート時の単価をスナップショットとして保存
- **影響範囲:** `calculateTotalAllECSites()` のフォールバック順序を `unit_price → price → productMap.price` に変更

#### 卸販売管理 — 同等の単価スナップショット改修
- WEB販売と同等の問題を卸販売でも修正
- `wholesale_summary` に `unit_price` カラムを追加

#### OEM売上入力画面 — マスターデータ優先方式
- **問題:** OEM入力画面の単価入力フィールドが、結局マスターデータで上書きされる
- **修正:** 単価フィールドをマスターから自動取得・読み取り専用に変更
- **ファイル:** `app/wholesale/oem-sales/page.tsx`, `components/wholesale/oem-area.tsx`

#### BASE CSVインポート — 実売金額・複数マッチ対応
- **base-parse (ver.5):** CSVの合計金額列もパース・集計、`base_amount` として保存（参考データ用）
- **csvHelpers.ts:** BASEのみ同一マスターへの複数マッチ許可（送料別/送料込み対応）
- **金額表示の設計方針:** クーポン・割引は広告費扱い、全ECサイト `count × マスター価格` で統一表示

#### DBスキーマ変更
- `web_sales_summary` に `base_amount` (integer, DEFAULT 0) を追加

#### 関連ファイル
| ファイル | 変更内容 |
|---------|---------|
| `app/api/import/base-parse/route.ts` | CSV合計金額列のパース・集計 |
| `app/api/import/base-confirm/route.ts` | base_amount保存、unit_price非上書き |
| `lib/csvHelpers.ts` | BASEのみ重複マッチ許可（allowDuplicate） |
| `components/BaseCsvImportModal.tsx` | confirm送信時にamountを含める |
| DB RPC `get_monthly_financial_summary` | count × マスター価格 に統一 |


### 2026-03-05~06 広告管理システム — Google手動同期・Meta広告CSV取り込み

#### Google広告 — 手動同期方式
- Google Ads API方式を断念（OAuth承認審査の困難）、手動データ入力方式に移行
- `advertising_costs` テーブルにシリーズ別・プラットフォーム別の広告費を保存

#### Meta広告 — CSV取り込み
- `/docs/meta-guide` にMeta広告マネージャCSVエクスポートガイドを作成
- `meta_campaign_performance`, `meta_campaign_series_map` テーブル新設
- API群（upload-csv, auto-match, import-costs, ai-analysis）、`meta-tab.tsx` 実装


### 2026-03-07 広告管理システム — 楽天RPP・Yahoo!アイテムマッチ CSV取り込み

#### 楽天RPP広告
- `/docs/rakuten-rpp-guide` にCSVエクスポートガイド作成
- `rakuten_rpp_performance` テーブル新設、API群4本、`rakuten-tab.tsx` 実装

#### Yahoo!アイテムマッチ広告
- `/docs/yahoo-ads-guide` にCSVエクスポートガイド作成
- `yahoo_ads_performance`, `yahoo_item_series_map` テーブル新設、API群4本、`yahoo-tab.tsx` 実装
- `get_monthly_financial_summary` RPCに `yahoo_cost` 追加（ダッシュボード反映修正）


### 2026-03-08 広告管理システム — Amazon広告CSV移行・AIチャットウィンドウ

#### Amazon スポンサープロダクト広告 CSV/XLSX取り込み
- Amazon Ads API方式を断念、CSV/XLSXベースの手動取り込みに方針転換
- `/docs/amazon-sp-guide` に「広告対象商品」レポートのダウンロード手順書作成
- `amazon_ads_performance`, `amazon_code_series_map` テーブル新設
- API群5本（upload-csv, auto-match, import-costs, ai-analysis, clear-mappings）
- `amazon-tab.tsx` — KPIカード8種 + キャンペーン単位集約表示（複数ASIN対応）
- XLSX日付パース修正、プルダウンソート統一、準備中タブ削除

#### AIチャットウィンドウ（全広告タブ共通）
- `/api/ads/chat` — 会話履歴保持 + Gemini 2.5 Flash + 広告データコンテキスト付与
- `components/AdChatWindow.tsx` — プラットフォーム別テーマカラー、サジェスト質問
- AI分析結果を会話起点として引き継ぎ、追加質問可能

#### 関連ファイル
| ファイル | 変更内容 |
|---------|---------| 
| `app/docs/amazon-sp-guide/page.tsx` | Amazon広告CSVエクスポートガイド（新規） |
| `app/api/amazon-ads/*/route.ts` | Amazon広告API群（5本、新規） |
| `app/api/ads/chat/route.ts` | 広告AIチャットAPI（新規・全タブ共通） |
| `components/AdChatWindow.tsx` | AIチャットウィンドウ（新規・全タブ共通） |
| `app/web-sales/advertising/amazon-tab.tsx` | Amazonタブ（新規） |
| `app/web-sales/advertising/page.client.tsx` | Amazonタブ追加・準備中タブ削除 |


### 2026-03-09 レシピ-卸販売紐付け・卸OEM統合・ダッシュボード改修

#### レシピ-卸販売商品紐付け機能
- **DBスキーマ変更:** `recipes`テーブルに`linked_wholesale_product_id`カラム（UUID型）を追加
- **新規API:** `/api/recipe/sync-wholesale` — レシピ⇔卸販売商品の紐付け管理（GET/POST/PUT）
  - GET: レシピと卸販売商品を取得し、名前類似度でマッチング候補を生成
  - POST: 紐付け/解除（1対1制約）
  - PUT: 価格・利益率同期（卸価格 = 販売価格 × 0.7）
- **新規ページ:** `/app/recipe/wholesale-link/page.tsx` — AIマッチング・手動紐付け・一括紐づけ・全件同期
- **レシピ一覧:** 「自社」タブで卸販売紐付け済み商品に緑色バッジ（卸）を表示、WEB販売紐付けは青色バッジ（WEB）で区別
- **利益率表示:** 「自社」タブの利益率を「利益率（７掛）」として卸価格シミュレーション（70%）ベースで表示

#### 卸販売ダッシュボード改修
- **データのない月を非表示:** URLパラメータなしの初回アクセス時、`wholesale_sales`テーブルから最新売上月を取得してデフォルト表示（WEB販売と同じロジック）
- **リンクマーク表示:** 日別売上テーブルで紐付け済み商品名の横にLink2アイコンバッジを表示
  - RLSバイパスのため`/api/recipe/sync-wholesale`経由でサーバー側取得に変更

#### 卸販売管理 通常卸×OEM テーブル統合（案A実行）

##### DBマイグレーション
| 変更 | 内容 |
|------|------|
| `wholesale_products` | `product_type`カラム追加（`'通常卸'` / `'OEM'`） |
| OEM商品移行 | `oem_products` 53件 → `wholesale_products`（ID保持） |
| `wholesale_customers` | `oem_customers`からリネーム＋`customer_type`カラム追加（22件） |
| OEM売上移行 | `oem_sales` 147件 → `wholesale_sales`（customer_id付き） |

##### API改修
| ファイル | 変更内容 |
|---------|---------|
| `app/api/wholesale/products/route.ts` (ver.6) | `?type=通常卸/OEM/all`パラメータ対応、POST時`product_type`設定 |

##### UI改修
| ファイル | 変更内容 |
|---------|---------|
| `app/wholesale/products/page.tsx` (ver.4) | 通常卸/OEMタブ統合、タブ切替で商品フィルター＆新規登録時の種別自動設定 |
| `app/wholesale/dashboard/page.tsx` | OEM商品取得を統合API経由に変更、OEM売上をwholesale_salesからcustomer_id IS NOT NULLで取得 |
| `components/wholesale/oem-area.tsx` | 「OEM商品管理」→統合「商品管理」ページに遷移 |
| `components/wholesale/sales-data-table.tsx` | linkedProductIds prop追加、リンクバッジ表示 |

##### 設計ポイント
- OEM商品が`wholesale_products`に統合されたため、将来のレシピOEMタブ紐付けは**既存の`linked_wholesale_product_id`をそのまま使用可能**
- 旧テーブル（`oem_products`, `oem_sales`）はバックアップとして残存、動作確認後Phase 4で削除予定


### 2026-03-10 見積書データ連携（Doc Scanner→TSA）・AIマッチング・重複修正

#### Doc Scanner → TSA 見積書連携（前回から継続）
- **見積書データ重複削除**: ダイサン食材の見積書が2回取り込まれ`pending_estimate_items`に重複 → 整理（11→3件）
- **重複防止ロジック**: `lib/tsa-integration.ts` に同一`doc_scanner_doc_id`での二重送信チェック追加

#### 見積書確認ページ全面修正（`app/recipe/estimates/page.tsx`）
- **材料取得エラー修正**: `ingredients`テーブルに存在しない`price_excl_tax`・`supplier`カラム参照でクエリ全失敗 → 実テーブル定義に合致
- **RLS回避**: 材料リスト取得をクライアントsupabase → サーバーAPI経由（service role key）に変更
- **候補UIドロップダウン化**: 検索欄フォーカスで全材料候補ドロップダウン、リアルタイム絞り込み、タグ表示
- **position:fixed**: 画面下部でも上方向に開く、親overflowに影響されない

#### Gemini 2.0 Flash AIマッチング
- 未マッチ品目を既存材料マスターとAIで照合（`app/api/recipe/estimates/route.ts`）
- 結果をDB保存（2回目以降は再計算不要）
- ⭐推奨マーク付き先頭表示、マッチ確信度バッジ

#### Doc Scanner — direction判定プロンプト修正
- 見積書の方向誤判定（自社→他社と判定すべき所を逆に）を修正
- AIプロンプトのdirectionルールを5項目に詳細化

#### Doc Scanner — 再処理時のファイル再移動
- 再処理で分類変更時もファイルを正しいフォルダに自動再移動
- ファイルパス検索を `moved_to_path` → `local_copy_path` → `file_path` 優先順位に
- TSA連携も再処理時に実行

#### 関連ファイル
| ファイル | 変更内容 |
|---------|---------|
| `app/api/recipe/estimates/route.ts` | AIマッチング追加、カラム修正、ingredients取得修正 |
| `app/recipe/estimates/page.tsx` | ドロップダウンUI、position:fixed |
| `components/main-sidebar.tsx` | 事務支援システムリンク追加 |
| `doc-scanner/lib/processor.ts` | direction修正、reprocessDocument改修 |
| `doc-scanner/lib/tsa-integration.ts` | 重複送信防止 |

---

### 2026/03/11 — Doc Scanner: レシート経費経路AI自動振り分け

#### 背景
小口経費の部署振り分け（3部署）と現金出納簿・クレジット払いの区分を、レシートスキャン時にAIで自動判定する必要があった。

#### 実装内容 — 5経路自動振り分け
レシートに対して以下の5経路を自動判定:

| 経路 | `department`値 | 判定基準 |
|------|---------------|---------|
| 小口（会津ブランド館） | `A` | 余白に手書きⒶ |
| 小口（製造） | `B` | 余白に手書きⒷ |
| 小口（道の駅） | `C` | 余白に手書きⒸ |
| 現金出納簿 | `cash_book` | 手書きコードなし＋現金払い |
| 本社クレジット払い | `credit` | レシート印字にクレジット/VISA/JCB等 |

- クレジット払いには部門振り分けなし（クレジット優先判定）
- レシート以外の書類（請求書・見積書等）は`department = null`

#### 技術ポイント
- **Gemini 2.5 Flash**: 手書きの丸囲み文字（©マーク類似形状）を高精度で認識
- **AIプロンプト**: 支払方法確認 → 手書きコード確認の2段階フローチャートで判定
- **DBマイグレーション**: `documents`テーブルに`department`カラムを自動追加

#### 関連ファイル
| ファイル | 変更内容 |
|---------|---------| 
| `doc-scanner/lib/constants.ts` | `DEPARTMENTS`, `EXPENSE_ROUTES` 定数追加 |
| `doc-scanner/lib/db.ts` | `department`カラム追加（マイグレーション・型・更新対応） |
| `doc-scanner/lib/processor.ts` | AIプロンプトに5経路判定ルール追加 |
| `doc-scanner/app/documents/page.tsx` | 経路バッジ・フィルター追加 |
| `doc-scanner/app/documents/[id]/page.tsx` | 経費経路フィールド追加（表示・編集） |
| `doc-scanner/app/api/documents/route.ts` | `department`フィルターパラメータ対応 |

#### Doc Scanner — 精算書（settlement）書類種別追加
- `DOC_TYPES` に `settlement: '精算書'` 追加
- `DOC_SUBTYPES` に `payment`（支払精算書）/ `consignment`（委託精算書）/ `expense`（経費精算書）
- AIプロンプトに精算書認識ルール追加（「その他」に誤分類防止）
- 既存の「その他」分類の精算書（道の駅なみえ精算報告書）を修正済み
- ファイルもネットワークドライブ上の「精算書」フォルダに再移動済み


### 2026-03-17 DisGrav — Antigravity遠隔操縦 Discord Bot 新規開発

#### 概要
外出先のスマホ（Discord）からAntigravityを遠隔操作するための中継Botプログラム「DisGrav」を新規開発。

#### プロジェクト
- **場所:** `C:\作業用\disgrav`
- **技術スタック:** Node.js, discord.js v14, chrome-remote-interface (CDP), dotenv
- **Discordサーバー:** 会津ブランド館Antigravity（# 開発チャンネル）

#### 実装内容

##### Discord Bot基盤（Step 1-2）
- Discordサーバー「会津ブランド館Antigravity」作成、Bot「DisGrav」をDeveloper Portalで作成・招待
- MESSAGE CONTENT INTENT特権インテント有効化
- `!ag ping` → pong応答の基礎通信テスト成功

##### 双方向操作Bot v2（Step 3）
| コマンド | 機能 |
|----------|------|
| `!ag chat <msg>` / `!ag c` | Antigravityにチャット送信→応答自動転送 |
| `!ag ok` / `!ag y` | 承認ボタンをクリック |
| `!ag no` / `!ag n` | 拒否ボタンをクリック |
| `!ag run <cmd>` | PowerShellコマンドリモート実行 |
| `!ag ps` | プロセス一覧 |
| `!ag ls [path]` | ディレクトリ一覧 |
| `!ag status` | 稼働状態（Embed表示） |
| `!ag inspect` | Antigravity DOM構造調査 |
| `!ag targets` | CDPターゲット一覧 |
| `!ag buttons` | 承認ボタン検出一覧 |

- **Discord Button UI:** 承認要求を✅承認/🚫拒否/✅全承認のインタラクティブボタン付きEmbed表示
- **自動ポーリング:** Antigravityの変化を4秒間隔で監視し、応答・承認要求を自動転送
- **長文分割送信:** Discord 2000文字制限を自動分割対応
- **Embed表示:** ヘルプ・ステータスをリッチEmbed形式で表示

#### 関連ファイル
| ファイル | 説明 |
|---------|------|
| `disgrav/index.js` | Discord Bot本体（v2） |
| `disgrav/antigravity_controller.js` | CDP経由Antigravity操作モジュール |
| `disgrav/start.bat` | Antigravity(CDP有効) + Bot 一括起動 |
| `disgrav/.env` | Token, Channel ID, CDP Port設定 |
| `disgrav/package.json` | discord.js, chrome-remote-interface, dotenv |

#### 未完了・次回対応
- **Antigravity CDP有効化:** `start.bat` でAntigravityを `--remote-debugging-port=9333` 付きで再起動する必要あり
- **DOMセレクター調整:** CDP接続後に `!ag inspect` でDOM構造を調査し、チャット入力欄・メッセージ・承認ボタンのセレクターを実際のDOMに合わせて修正
- **PM2常駐化:** Bot を PM2 で自動再起動管理


### 2026-03-20 レシピ詳細ページ改善 + DocScanner連携

#### 原材料済アイコン
- レシピ詳細の材料テーブルに、原材料取込済みの食材にFlaskConicalアイコン（緑色）を表示

#### バージョン履歴プレビュー
- 履歴バッジをインライン表示（`[v1] [v2 テスト] [+ 履歴作成]`）
- クリックでプレビュー（DBを変更せずスナップショットを表示）、再クリックで解除
- プレビュー中の保存バー: 「Ver.X を採用して保存」 or 「戻る」
- ホバーで✕マーク → 履歴削除
- 「+ 履歴作成」はスナップショット保存のみ。画面下部の「保存」が最終保存

#### レシピ印刷→DocScanner連携（Supabaseポーリング方式）
- TSA印刷ボタン → Supabase `recipe_print_logs` テーブルにINSERT
- DocScanner → 60秒ポーリングで取得 → ローカルSQLiteに「レシピ印刷」として登録
- HTTPS(Vercel)→HTTP(ローカル)の混合コンテンツ問題を回避

#### 小数点表示
- 分量・原価を小数点第2位で四捨五入表示に統一

#### %スケール制限
- 基本(1)の%スケール入力を原材料セクションのみに制限（商品・資材・諸経費から削除）

#### 履歴作成のローカルスナップショット化
- `saveVersion` はDBに直接保存せず `pendingVersions` ローカルstateにスナップショット追加
- 未確定履歴は緑色点線枠バッジ（`新1`, `新2`...）で表示、ホバー✕で個別削除
- 最終保存ボタン（`saveChanges`）でペンディング履歴をDBに一括保存
- キャンセルでペンディング履歴もクリア

#### %スケーリングのキャンセル対応
- `cancelChanges` 時に `currentScalePercent` と `originalUsageMap` をリセット
- キャンセル後に↩ボタンが残る不具合を修正

#### 1g単価列の追加
- 原材料セクションのみ、基本(1)列の右に「1g単価」列を追加
- 計算: `原価(1) ÷ 使用量g`
- 列並び順: `基本(1)` → `1g単価` → `原価(1)` → `400個分` → `800個分`

#### UI整理
- ヘッダーの重複ボタン（「印刷」「一覧に戻る」）を削除
- TOTAL行も小数点第2位表示に統一

