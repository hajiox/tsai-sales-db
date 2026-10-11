# TSA MCP 業務対応表（2026-10-11）

TSA開発②への管理者依頼に基づき、既存画面・API・DBの業務処理を棚卸しした。MCPアダプターはv1.4.0、32ツール。業務表152対象（132 CRUD / 20読取）と、既存計算・取込・出力・ジョブの228操作を提供する。操作名・入力schemaは `tsa_operation_catalog` を正とする。

| 業務 | 判定 | 対応 |
| --- | --- | --- |
| レシピ・食材・資材・シリーズ・卸/OEM・商品マスター | 対応済み | 既存汎用CRUD、version競合検査、明細一括置換、原価同期 |
| JAN発番・割当・属性更新・バーコード | 対応済み | 専用5ツール。JAN汎用CRUDは読取に限定し番号保護を維持 |
| レシピ版履歴・複製・復元・見積取込・原材料表示 | 対応済み | 既存保存値・計算式・照合処理を再利用 |
| EC価格・名称・キャッチコピー・本文・予約・画像 | 対応済み | 固定snapshot、既存ジョブ、予約と実行の区別、状態追跡 |
| レビュー収集・分析・一括巡回 | 対応済み | 既存ジョブと保存結果を照合。登録受付を成功と扱わない |
| SNS画像/文章生成・投稿・履歴 | 対応済み | 既存Skill/model/許可/アカウントと固定内容を維持 |
| EC売上・広告費・控除・ABCD・月次分析 | 対応済み | 既存公式API/Bridge、CSV検証、実売額計算、保存・帳票 |
| 卸売上・納品書・助ネコ原本・棚卸・製造実績 | 対応済み | 既存関連明細・原価再計算・revision検証 |
| 財務・元帳・決算資料・店舗POS・店舗棚卸 | 対応済み | 固定集計/検索、確認済みCSV/PDF取込、元帳/試算表照合 |
| ラベルOCR/期限判定・材料画像・見積価格 | 対応済み | 既存AIと判定式、確認済み価格/表示値の反映 |
| 楽天検索依頼履歴 | 対応済み | 既存履歴表を汎用業務対象へ追加 |
| 上記業務の不足ツール | ツール不足を解消 | 228固定操作を追加。任意SQL/URL/コード/シェルは機能対象外 |
| 限定接続での全業務操作 | 権限不足（意図した制限） | business:fullかつ対象制限なしの接続だけ利用可。CEO_S等の既存キーは再発行しない |
| 外部ECのログイン・MFA・CAPTCHA・操作許可 | 外部サービス制約 | 必要な人間操作を待つ。MCPから迂回しない |
| 大容量原本 | 外部サービス制約 | Vercelの4.5MB上限に対しJSON req/respを4MiBへ制限。file1件3MiB、base64込総量4MiB。大きいPDFは既存画面の分割取込、保存PDFの分割取得は可能 |
| 退店先の新規実行・MakeShop開店準備 | 外部サービス制約/既存業務方針 | Mercari/Qoo10/TikTokの新規実行なし、過去データ保持。MakeShopは準備枠 |
| DocScannerからの着信納品書・取引条件連携 | 外部サービス制約 | アプリ間の専用secret認証入口をMCPへ転用しない。TSA側の保存済み業務データは閲覧・操作対象 |
| 接続管理・資格情報・コード改修・配置・システム制御 | 対象外 | このMCPへ公開しない。既存管理経路に限定 |

## 実行契約

登録・更新・削除・外部AI/ジョブ実行は、利用者が指示した対象/値と実行キーで開始する。追加承認は不要。接続IDをactorに記録し、同じキー/同じ入力は再実行せず既存状態を返す。running/unknown/タイムアウトは元のキーで照会し、新しいキーで重複実行しない。接続の失効・期限・権限を毎回確認する。業務変更と実行台帳は別transactionのため、結果未確定を成功へ読み替えない。任意のAPIパス、URL、SQL、モジュール、model、promptを実行対象として指定できない。

## 検証と本番反映

- 正常/不正入力・権限・競合・同時再送・結果不明・ファイルhash・秘密除去のfocused tests。
- 全228操作のschema、固定148 API modules、HTTP method、request組立を実handler実行なしで検証。
- 実DB上の合成fixture+DDLをrollbackし、9拒否条件・冪等性・監査を検証。
- 本番の業務データ変更や既存Bridge/予約操作はテストに使用しない。短命合成接続で実SDK handshake/list/read/限定権限拒否/失効を検証する。
- 既存全体tscエラーとSNS既存2テスト不一致は今回追加領域の診断と分けて記録する。

## 追加操作一覧

| 操作 | 種別 | 既存業務 |
| --- | --- | --- |
| `recipe.ec_sync_input` | 読取/生成ファイル | 保存済みレシピからEC反映に必要な既存照合snapshot・税込価格・本文配置を取得 |
| `recipe.ingredient_label.generate` | 実行キー必須 | 保存済み配合から原材料表示候補の既存Bridge生成を開始 |
| `recipe.ingredient_label.status` | 読取/生成ファイル | 対象レシピの原材料表示生成状況 |
| `recipe.ec_name.generate` | 実行キー必須 | 保存済み情報から共通EC商品名候補を生成 |
| `recipe.ec_name.generation_status` | 読取/生成ファイル | EC商品名候補生成状況 |
| `recipe.ec_catchcopy.generate` | 実行キー必須 | 保存済み情報から共通ECキャッチコピー候補を生成 |
| `recipe.ec_catchcopy.generation_status` | 読取/生成ファイル | ECキャッチコピー生成状況 |
| `recipe.ec_content.generate` | 実行キー必須 | 確認済み商品ポイント・説明を500文字以内へ調整 |
| `recipe.ec_content.generation_status` | 読取/生成ファイル | 商品文章調整の状況 |
| `recipe.ec_price.sync` | 実行キー必須 | 保存済み価格を指定した活動中ECへ実行または予約。既存照合・Bridgeを利用 |
| `recipe.ec_price.status` | 読取/生成ファイル | EC価格反映の状況・履歴 |
| `recipe.ec_name.sync` | 実行キー必須 | 保存済み共通商品名を活動中ECへ実行または予約 |
| `recipe.ec_name.status` | 読取/生成ファイル | EC商品名反映の状況・履歴 |
| `recipe.ec_catchcopy.sync` | 実行キー必須 | 共通キャッチコピーを楽天・Yahooへ実行または予約 |
| `recipe.ec_catchcopy.status` | 読取/生成ファイル | ECキャッチコピー反映の状況・履歴 |
| `recipe.ec_content.sync` | 実行キー必須 | 確認済み商品ポイント・説明を活動中ECへ反映 |
| `recipe.ec_content.status` | 読取/生成ファイル | EC商品文章反映の状況・履歴 |
| `recipe.ec_price.reservations` | 読取/生成ファイル | 既存EC反映予約の一覧 |
| `recipe.ec_price.execute_reservations` | 実行キー必須 | 保存済みEC反映予約を一括実行。各既存snapshotを再照合 |
| `recipe.ec_price.cancel_reservation` | 実行キー必須 | 指定した未開始EC反映予約を取り消す |
| `recipe.ec_name.reservations` | 読取/生成ファイル | 既存EC反映予約の一覧 |
| `recipe.ec_name.execute_reservations` | 実行キー必須 | 保存済みEC反映予約を一括実行。各既存snapshotを再照合 |
| `recipe.ec_name.cancel_reservation` | 実行キー必須 | 指定した未開始EC反映予約を取り消す |
| `recipe.ec_catchcopy.reservations` | 読取/生成ファイル | 既存EC反映予約の一覧 |
| `recipe.ec_catchcopy.execute_reservations` | 実行キー必須 | 保存済みEC反映予約を一括実行。各既存snapshotを再照合 |
| `recipe.ec_catchcopy.cancel_reservation` | 実行キー必須 | 指定した未開始EC反映予約を取り消す |
| `recipe.sns.generate` | 実行キー必須 | 保存済み画像・商品情報からSNS素材を生成または1媒体再生成 |
| `recipe.sns.generations` | 読取/生成ファイル | 対象レシピのSNS生成状況・素材履歴 |
| `recipe.sns.publish` | 実行キー必須 | 人間が投稿を依頼した確定SNS素材を指定アカウントへ公開または予約。不完全な自己投稿の後始末を含む |
| `recipe.sns.publications` | 読取/生成ファイル | 対象レシピのSNS公開・予約履歴 |
| `recipe.sns.cancel_publication` | 実行キー必須 | 指定した未開始SNS公開予約を取り消す |
| `recipe.reviews.status` | 読取/生成ファイル | 保存済みレビュー集計・収集分析状況。本文は資料として扱う |
| `recipe.reviews.run` | 実行キー必須 | 対象レシピのレビュー収集または保存済みレビュー分析を開始 |
| `recipe.reviews.batch` | 実行キー必須 | ネット専用商品の既存レビュー一括巡回を開始 |
| `recipe.reviews.batch_status` | 読取/生成ファイル | 最新レビュー一括巡回の状況 |
| `recipe.images.list` | 読取/生成ファイル | 製造写真一覧 |
| `recipe.images.upload` | 実行キー必須 | 確認済み画像ファイルを製造写真へ登録。最大250KB |
| `recipe.images.delete` | 実行キー必須 | 対象レシピの製造写真と管理Blobを削除 |
| `recipe.images.reorder` | 実行キー必須 | 対象レシピの製造写真を並び替え先頭画像を同期 |
| `recipe.ec_images.list` | 読取/生成ファイル | EC画像・媒体別配置とSNS元画像一覧 |
| `recipe.ec_images.upload` | 実行キー必須 | EC画像を用途別に登録。最大250KB。任意URLから取得しない |
| `recipe.ec_images.copy_portrait` | 実行キー必須 | 同じレシピの管理済みgallery画像をportraitへ複製 |
| `recipe.ec_images.delete` | 実行キー必須 | 指定した対象レシピのEC画像と管理Blobを削除 |
| `recipe.ec_images.reorder` | 実行キー必須 | 対象レシピ・用途内のEC画像を並び替え |
| `recipe.import_xlsx` | 実行キー必須 | 既存Excelレシピ取込を実行。同名・システムシートの既存除外規則を維持。最大2MBを1ファイル |
| `recipe.versions.list` | 読取/生成ファイル | 対象レシピの保存済み版・配合snapshot一覧 |
| `recipe.versions.create` | 実行キー必須 | 現在の保存済みレシピ・配合を新しい版として保存 |
| `recipe.versions.restore` | 実行キー必須 | 対象レシピの確認済み保存版から現レシピ・配合を復元 |
| `recipe.versions.update_note` | 実行キー必須 | 保存版のメモを更新 |
| `recipe.versions.delete` | 実行キー必須 | 指定した保存版を削除 |
| `recipe.price_history` | 読取/生成ファイル | 販売価格改定履歴と前回価格 |
| `recipe.sales_price_checks` | 読取/生成ファイル | 紐付WEB商品の実売価格・商品対応を照合 |
| `recipe.database_usages` | 読取/生成ファイル | 食材・資材の使用レシピと必要量を集計 |
| `recipe.intermediate_usages` | 読取/生成ファイル | 中間部品から使用する親レシピを逆引き |
| `recipe.integration_candidates` | 読取/生成ファイル | 未紐付け配合明細と参照マスター候補 |
| `recipe.integrate_references` | 実行キー必須 | 確認済み名称に一致する配合明細を指定マスターへ一括紐付け |
| `recipe.web_links` | 読取/生成ファイル | レシピの商品紐付け状況・候補を取得。autoMatch指定時は既存名称・価格スコアで候補を計算 |
| `recipe.web_link` | 実行キー必須 | 確認済み商品との1対1紐付け・解除と既存価格同期 |
| `recipe.web_link_batch` | 実行キー必須 | 確認済み商品との1対1紐付けを一括保存し既存価格を同期 |
| `recipe.web_create_and_link` | 実行キー必須 | 確認済み名称・価格で商品を新規作成しレシピへ紐付け |
| `recipe.web_sync_prices` | 実行キー必須 | 既存の紐付済み商品へ保存済みレシピ価格を一括同期 |
| `recipe.wholesale_links` | 読取/生成ファイル | レシピの商品紐付け状況・候補を取得。autoMatch指定時は既存名称・価格スコアで候補を計算 |
| `recipe.wholesale_link` | 実行キー必須 | 確認済み商品との1対1紐付け・解除と既存価格同期 |
| `recipe.wholesale_link_batch` | 実行キー必須 | 確認済み商品との1対1紐付けを一括保存し既存価格を同期 |
| `recipe.wholesale_create_and_link` | 実行キー必須 | 確認済み名称・価格で商品を新規作成しレシピへ紐付け |
| `recipe.wholesale_sync_prices` | 実行キー必須 | 既存の紐付済み商品へ保存済みレシピ価格を一括同期 |
| `recipe.oem_links` | 読取/生成ファイル | レシピの商品紐付け状況・候補を取得。autoMatch指定時は既存名称・価格スコアで候補を計算 |
| `recipe.oem_link` | 実行キー必須 | 確認済み商品との1対1紐付け・解除と既存価格同期 |
| `recipe.oem_link_batch` | 実行キー必須 | 確認済み商品との1対1紐付けを一括保存し既存価格を同期 |
| `recipe.oem_create_and_link` | 実行キー必須 | 確認済み名称・価格で商品を新規作成しレシピへ紐付け |
| `recipe.oem_sync_prices` | 実行キー必須 | 既存の紐付済み商品へ保存済みレシピ価格を一括同期 |
| `recipe.duplicates` | 読取/生成ファイル | 既存名称規則で重複レシピの候補を取得 |
| `recipe.merge_duplicates` | 実行キー必須 | 確認済みの残すレシピへ情報を統合し指定重複レシピを削除 |
| `recipe.cleanup_duplicates` | 実行キー必須 | 既存画面の自動重複整理を全グループへ実行する明示的な一括操作 |
| `recipe.delete_with_items` | 実行キー必須 | 指定レシピの配合明細と商品紐付けを整理して削除 |
| `recipe.estimates` | 読取/生成ファイル | 受信見積品目と食材・資材の照合候補を取得 |
| `recipe.estimates_match` | 実行キー必須 | 未照合見積品目を既存AI処理でマスター候補へ照合 |
| `recipe.estimate_price_impact` | 読取/生成ファイル | 確認済み材料価格変更が配合原価へ与える影響を試算 |
| `recipe.estimate_apply_price` | 実行キー必須 | 確認済み受信見積の価格を指定食材・資材へ反映し関連配合を同期 |
| `recipe.estimate_create_master` | 実行キー必須 | 確認済み受信見積から名称・入数を指定して食材・資材を登録 |
| `recipe.estimate_disposition` | 実行キー必須 | 指定受信見積の却下・スキップ・保留への復帰 |
| `recipe.estimates_disposition_batch` | 実行キー必須 | 指定した受信見積品目を一括スキップまたは保留へ復帰 |
| `recipe.inventory` | 読取/生成ファイル | 製造棚卸の履歴・明細・集計を取得 |
| `recipe.inventory_generate` | 実行キー必須 | 確認済み棚卸日・年度の製造棚卸を既存マスターから作成 |
| `recipe.inventory_sync` | 実行キー必須 | 既存製造棚卸のマスター単価・入数を最新情報へ同期 |
| `recipe.inventory_item_create` | 実行キー必須 | 棚卸明細を確認済み名称・入数・税込原価で追加 |
| `recipe.inventory_item_update` | 実行キー必須 | 棚卸明細の数量・単価・名称・税率を更新し既存計算を適用 |
| `recipe.inventory_item_delete` | 実行キー必須 | 指定製造棚卸明細を削除 |
| `recipe.char_siu_production` | 読取/生成ファイル | チャーシュー製造実績と固定材料・出来高定義を取得 |
| `recipe.char_siu_save_production` | 実行キー必須 | 確認済み使用量・出来高から製造実績を保存し既存原価計算を適用 |
| `recipe.char_siu_delivery_notes` | 読取/生成ファイル | 未使用の納品書スキャンとDocScanner受信候補を取得 |
| `recipe.char_siu_import_delivery_note` | 実行キー必須 | 確認済みDocScanner納品書を指定製造日へ取り込む |
| `recipe.char_siu_review_delivery_note` | 実行キー必須 | 確認済み豚バラ・ネギ・生姜の仕入数量と税込価格を納品書へ確定 |
| `recipe.char_siu_scan_delivery_note` | 実行キー必須 | 納品書写真を既存AIで読取。4枚まで・1枚875KB以下で合計3.5MB以下 |
| `recipe.dining_costs` | 読取/生成ファイル | 飲食メニューと中間部品の原価・利益計算済み一覧または指定詳細 |
| `recipe.dining_item_costs` | 読取/生成ファイル | 飲食用食材・資材の単位原価を取得 |
| `recipe.categories` | 読取/生成ファイル | レシピカテゴリ一覧 |
| `recipe.category_create` | 実行キー必須 | 確認済み名称でレシピカテゴリを登録 |
| `finance_acquisition_enqueue` | 実行キー必須 | 売上・広告費・EC控除を既存の公式API/Bridge取得待機へ登録。稼働中・保存済み結果を保持します。 |
| `web_sales_monthly_report` | 読取/生成ファイル | 保存済みWEB月次実績を通常画面と同じ実売額・原価で集計。 |
| `web_sales_period_report` | 読取/生成ファイル | 保存済みWEB実績を指定月から指定月数で集計。 |
| `web_sales_chart_report` | 読取/生成ファイル | 通常画面と同じ6/12か月推移と財務・シリーズ集計。 |
| `web_sales_display_period` | 読取/生成ファイル | 原本の登録状況から通常画面の集計期間を確認。 |
| `web_sales_mapping_finalize` | 実行キー必須 | 確認済み未紐付け商品を紐付け、既存月次確定処理を再実行。 |
| `web_sales_channel_clear` | 実行キー必須 | 指定月・指定チャネルの売上数量と実売額を通常画面と同じ処理で消去。allは全EC列、csvは月次行全体を削除。 |
| `ec_profit_report` | 読取/生成ファイル | 月次売上・原価・EC控除・広告費・最終利益と品質を通常画面と同じ計算で取得。退店先の保存履歴も含みます。 |
| `ec_profit_estimate` | 実行キー必須 | 楽天の既存推計ルールでEC控除概算を更新。確定原本の保護を維持。 |
| `web_sales_analysis_enqueue` | 実行キー必須 | 通常画面の集計期間・固定モデル契約でWEB売上経費分析を開始。 |
| `web_sales_analysis_packet` | 読取/生成ファイル | 月末WEB分析の根拠packet・hash・保存requestIdを取得。 |
| `web_sales_analysis_save` | 実行キー必須 | 取得したpacket/hashと構造化分析を検証し不変履歴へ保存。外部投稿なし。 |
| `web_sales_abcd_overview` | 読取/生成ファイル | ABCD最新分析と財務判定を全稼働ECで取得。 |
| `web_sales_abcd_history` | 読取/生成ファイル | 指定ECの保存済みABCD分析履歴を取得。退店先の履歴閲覧も可。 |
| `web_sales_abcd_detail` | 読取/生成ファイル | ABCD保存結果・関連改善履歴・現在の財務判定。 |
| `web_sales_abcd_inspect` | 読取/生成ファイル | ABCD帳票のヘッダー・列候補・行数・期間メタデータを解析。 |
| `web_sales_abcd_preview` | 読取/生成ファイル | 確認した列と分母分子・期間でABCDを計算し保存前に確認。 |
| `web_sales_abcd_save` | 実行キー必須 | 確認した稼働EC・期間・分母分子のABCD分析を重複防止付きで保存。 |
| `wholesale_delivery_note_options` | 読取/生成ファイル | 納品書用の確認済み顧客・レシピ紐付商品と取引条件を取得。 |
| `wholesale_delivery_notes` | 読取/生成ファイル | 通常画面の納品書一覧を取得。 |
| `wholesale_delivery_note_detail` | 読取/生成ファイル | 納品書の全明細・取引条件・金額を取得。 |
| `wholesale_delivery_note_create` | 実行キー必須 | 確認済み顧客・日付・明細で納品書を発行し通常画面と同じ卸売上を同期。 |
| `wholesale_delivery_note_delete` | 実行キー必須 | 指定納品書を削除し関連卸売上を通常画面と同じ処理で再構築。 |
| `wholesale_sales_import` | 実行キー必須 | 確認済み卸CSV行を通常画面の金額計算で登録。未登録名は既存仕様に従い商品登録されます。 |
| `wholesale_sales_month_delete` | 実行キー必須 | 指定した1か月の卸売上を通常画面と同じ一括削除処理で削除。 |
| `wholesale_product_statistics` | 読取/生成ファイル | 指定年月の卸/OEM商品別販売統計を通常画面と同じRPCで取得。 |
| `wholesale_inventory_master_status` | 読取/生成ファイル | 助ネコ商品基本情報マスターの取込状態を確認。 |
| `wholesale_inventory_master_import` | 実行キー必須 | 助ネコ商品基本情報CSVを登録。全件原本の検証を維持。 |
| `wholesale_inventory_import` | 実行キー必須 | 助ネコ在庫CSVをマスター・レシピと照合し棚卸へ登録。確認済み手動単価を保持。 |
| `google_ads_sync` | 実行キー必須 | 指定期間のGoogle広告実績を既存APIで取得。 |
| `google_ads_mapping_learn` | 実行キー必須 | 確認済みアセットグループをシリーズへ紐付け実績へ同期。 |
| `google_ads_import_costs` | 実行キー必須 | 確認済みGoogle広告シリーズ配賦を月次広告費へ反映。 |
| `rakuten_ads_product_names` | 実行キー必須 | 楽天商品コード・商品名を一括登録し既存実績表示へ同期。 |
| `amazon_deals_parse` | 読取/生成ファイル | Amazon推奨セールExcelを通常画面と同じ列・編集可能セルで解析。 |
| `amazon_deals_export` | 読取/生成ファイル | 解析したセールExcelの編集可能セルだけを書き戻しExcel成果物を生成。ECへ公開しません。 |
| `amazon_deals_histories` | 読取/生成ファイル | Amazonセール表の仮保存・出力保存履歴と集計を取得。 |
| `amazon_deals_history_detail` | 読取/生成ファイル | 保存済みAmazonセール原本・編集値・検証結果を取得。 |
| `amazon_deals_history_save` | 実行キー必須 | 確認済みセール表と原本を仮保存/出力保存し通常画面と同じ件数集計を保存。EC公開なし。 |
| `annual_plan_csv_export` | 読取/生成ファイル | 当会計年度の前年度実績・目標・実績を既存CSV形式で出力。 |
| `kpi_monthly_csv_export` | 読取/生成ファイル | 当月・前月・年度累計のKPIを既存CSV形式で出力。 |
| `daily_sales_report_text` | 読取/生成ファイル | 最新の日次売上報告と月内累計の報告文を生成。外部投稿なし。 |
| `web_sales_amazon_csv_parse` | 読取/生成ファイル | amazon公式売上CSVの原本金額・数量を解析し既存紐付け候補を返します。候補は保存されません。 |
| `web_sales_amazon_csv_confirm` | 実行キー必須 | amazon公式売上CSVの確認済み紐付けを原本合計と照合し月次置換。 |
| `web_sales_rakuten_csv_parse` | 読取/生成ファイル | rakuten公式売上CSVの原本金額・数量を解析し既存紐付け候補を返します。候補は保存されません。 |
| `web_sales_rakuten_csv_confirm` | 実行キー必須 | rakuten公式売上CSVの確認済み紐付けを原本合計と照合し月次置換。 |
| `web_sales_yahoo_csv_parse` | 読取/生成ファイル | yahoo公式売上CSVの原本金額・数量を解析し既存紐付け候補を返します。候補は保存されません。 |
| `web_sales_yahoo_csv_confirm` | 実行キー必須 | yahoo公式売上CSVの確認済み紐付けを原本合計と照合し月次置換。 |
| `web_sales_base_csv_parse` | 読取/生成ファイル | base公式売上CSVの原本金額・数量を解析し既存紐付け候補を返します。候補は保存されません。 |
| `web_sales_base_csv_confirm` | 実行キー必須 | base公式売上CSVの確認済み紐付けを原本合計と照合し月次置換。 |
| `amazon_ads_csv_upload` | 実行キー必須 | amazon公式広告CSV/XLSXを既存の列検証・取込処理で登録。 |
| `amazon_ads_costs` | 実行キー必須 | amazon: 紐付け済み広告実績のシリーズ別費用を月次広告費に反映。 |
| `amazon_ads_match` | 実行キー必須 | amazon: 保存済み広告実績へ通常画面のシリーズ自動紐付けを適用。 |
| `amazon_ads_clear` | 実行キー必須 | amazon: 指定月の広告実績のシリーズ紐付けを解除。 |
| `amazon_ads_delete` | 実行キー必須 | amazon: 指定月の広告実績を通常画面の削除処理で削除。 |
| `amazon_ads_analysis` | 実行キー必須 | amazon: 指定月の広告実績を通常画面の既存AI分析で評価（既存API利用）。 |
| `meta_ads_csv_upload` | 実行キー必須 | meta公式広告CSV/XLSXを既存の列検証・取込処理で登録。 |
| `meta_ads_costs` | 実行キー必須 | meta: 紐付け済み広告実績のシリーズ別費用を月次広告費に反映。 |
| `meta_ads_match` | 実行キー必須 | meta: 保存済み広告実績へ通常画面のシリーズ自動紐付けを適用。 |
| `meta_ads_clear` | 実行キー必須 | meta: 指定月の広告実績のシリーズ紐付けを解除。 |
| `meta_ads_delete` | 実行キー必須 | meta: 指定月の広告実績を通常画面の削除処理で削除。 |
| `meta_ads_analysis` | 実行キー必須 | meta: 指定月の広告実績を通常画面の既存AI分析で評価（既存API利用）。 |
| `rakuten_ads_csv_upload` | 実行キー必須 | rakuten公式広告CSV/XLSXを既存の列検証・取込処理で登録。 |
| `rakuten_ads_costs` | 実行キー必須 | rakuten: 紐付け済み広告実績のシリーズ別費用を月次広告費に反映。 |
| `rakuten_ads_match` | 実行キー必須 | rakuten: 保存済み広告実績へ通常画面のシリーズ自動紐付けを適用。 |
| `rakuten_ads_clear` | 実行キー必須 | rakuten: 指定月の広告実績のシリーズ紐付けを解除。 |
| `rakuten_ads_delete` | 実行キー必須 | rakuten: 指定月の広告実績を通常画面の削除処理で削除。 |
| `rakuten_ads_analysis` | 実行キー必須 | rakuten: 指定月の広告実績を通常画面の既存AI分析で評価（既存API利用）。 |
| `yahoo_ads_csv_upload` | 実行キー必須 | yahoo公式広告CSV/XLSXを既存の列検証・取込処理で登録。 |
| `yahoo_ads_costs` | 実行キー必須 | yahoo: 紐付け済み広告実績のシリーズ別費用を月次広告費に反映。 |
| `yahoo_ads_match` | 実行キー必須 | yahoo: 保存済み広告実績へ通常画面のシリーズ自動紐付けを適用。 |
| `yahoo_ads_clear` | 実行キー必須 | yahoo: 指定月の広告実績のシリーズ紐付けを解除。 |
| `yahoo_ads_delete` | 実行キー必須 | yahoo: 指定月の広告実績を通常画面の削除処理で削除。 |
| `yahoo_ads_analysis` | 実行キー必須 | yahoo: 指定月の広告実績を通常画面の既存AI分析で評価（既存API利用）。 |
| `google_ads_analysis` | 実行キー必須 | 指定月のGoogle広告実績を既存画面のAI分析で評価（既存API利用）。 |
| `finance_jobs_status` | 読取/生成ファイル | 指定月の取得/分析ジョブ状態・成果物一覧を安全な業務項目だけで確認。 |
| `finance_job_artifact` | 読取/生成ファイル | 確認済みジョブと成果物IDに結び付く業務原本（source）を取得。実行ログ・AI出力・画面画像・保存パス・署名URLは返しません。 |
| `finance_job_cancel` | 実行キー必須 | 指定した取得/分析ジョブを通常画面と同じ状態制約で取消。実行中workerは停止しません。 |
| `finance_job_retry` | 実行キー必須 | 失敗・確認待ちの取得/分析ジョブを通常画面の状態制約で再実行。退店先の新規取得は拒否。 |
| `shipping_labels_convert` | 読取/生成ファイル | Amazon/Yahoo注文原本を登録済み変換表でヤマト/佐川CSVへ変換。未設定商品は一覧で返し出力に含めません。 |
| `shipping_labels_import_save` | 実行キー必須 | Amazon/Yahoo注文原本と確認済み配送設定・変換表を配送履歴へ保存。 |
| `shipping_labels_history` | 読取/生成ファイル | 配送CSV変換の保存済み履歴を取得。 |
| `shipping_labels_history_detail` | 読取/生成ファイル | 配送原本・変換設定・保存済み出力CSVを取得。 |
| `shipping_labels_export_save` | 実行キー必須 | 確認済み変換履歴にヤマト/佐川出力CSVを保存。 |
| `finance_overview` | 読取/生成ファイル | 通常画面と同じ財務概況を保存済み月から集計。 |
| `finance_trial_latest` | 読取/生成ファイル | 最終版試算表の最新状態を取得。 |
| `finance_trial_balance` | 読取/生成ファイル | 指定月の保存済み試算表を取得。 |
| `finance_trial_balance_delete` | 実行キー必須 | 指定月の試算表を既存削除処理で削除。 |
| `finance_trial_statement` | 読取/生成ファイル | 会計事務所の試算表と元帳差異・分析を通常画面の計算で取得。 |
| `finance_trial_statement_import` | 実行キー必須 | 確認済み試算表CSVを原本の科目・対象月・文字コードで取り込む。 |
| `finance_series` | 読取/生成ファイル | 保存済み財務数値の期間推移。 |
| `finance_transactions` | 読取/生成ファイル | 指定月・科目の元帳明細。 |
| `finance_search` | 読取/生成ファイル | 保存済み元帳を検索語・月・ページで検索。 |
| `finance_pl_totals` | 読取/生成ファイル | 通常画面と同じ損益合計。 |
| `finance_pl_snapshot` | 読取/生成ファイル | 指定月または年度累計の損益計算書。 |
| `finance_pl_month_totals` | 読取/生成ファイル | 保存済み月次損益推移。 |
| `finance_bs_totals` | 読取/生成ファイル | 通常画面と同じ貸借合計。 |
| `finance_bs_snapshot` | 読取/生成ファイル | 通常画面と同じ貸借対照表。 |
| `finance_import_status` | 読取/生成ファイル | 財務CSV・元帳の保存済み対象月と取込状態。 |
| `finance_equity_flags` | 読取/生成ファイル | 財務純資産の補完フラグを確認。 |
| `finance_closing_inventory` | 読取/生成ファイル | 製造・卸・店舗棚卸を年度別に通常画面と同じ方法で集約。 |
| `finance_refresh` | 実行キー必須 | 固定された既存財務集計ビューを更新し貸借一致を確認。SQLは指定できません。 |
| `finance_ai_analysis` | 実行キー必須 | 保存済み当月と直近3か月の費用から既存AI処理で異常候補を作成。モデル変更不可。 |
| `general_ledger_months` | 読取/生成ファイル | 保存済み元帳の対象月一覧。 |
| `general_ledger_import` | 実行キー必須 | 確認済み総勘定元帳CSVを指定年月へ既存手順で取り込み月次残高を同期。 |
| `general_ledger_closing_import` | 実行キー必須 | 確認済み決算整理CSVを指定年度の既存調整データへ置換取込。 |
| `general_ledger_raw_import` | 実行キー必須 | 確認済み元帳原本CSVを月・文字コード付きで既存原本保存へ取り込む。 |
| `annual_statements` | 読取/生成ファイル | 決算資料の年度・ページ・科目・分析結果を取得。documentId指定時は既存ページ本文も取得。 |
| `annual_statement_pdf` | 読取/生成ファイル | 保存済み決算資料PDFをIDで取得。大きい原本は既存の分割番号で取得。 |
| `annual_statement_import` | 実行キー必須 | 確認済みPDFを既存決算資料解析・原本保存へ取り込む。通信上限内のファイルを指定。 |
| `finance_char_siu_runs` | 読取/生成ファイル | 製造原価計算・材料・出来高・労務単価を保存実績から取得。 |
| `finance_char_siu_update` | 実行キー必須 | 確認した製造出来高・原価または既存TSG労務単価を通常画面の計算で反映。 |
| `finance_char_siu_delete` | 実行キー必須 | 指定した製造原価実績を通常画面の関連明細削除処理で削除。 |
| `food_store_csv_import` | 実行キー必須 | 確認済み店舗POS CSVをJAN・文字コード検証後、指定月へ既存取込。 |
| `food_store_product_category` | 実行キー必須 | 店舗商品を確認したJAN・名称・カテゴリへ紐付け。 |
| `food_store_inventory` | 読取/生成ファイル | 店舗棚卸の年度履歴と再計算済み明細を取得。 |
| `food_store_inventory_import` | 実行キー必須 | 確認済み棚卸xlsxを年度・棚卸日付きで原本hashと共に登録。 |
| `food_store_inventory_copy` | 実行キー必須 | 保存済み棚卸を指定年度へ複製し原本hashを保持。 |
| `food_store_inventory_update` | 実行キー必須 | revision一致を確認して店舗棚卸のセル変更・確定・再編集を行う。 |
| `label_check_history` | 読取/生成ファイル | 保存済みラベル判定をモード・判定・検索語でページ取得。 |
| `label_check_recipes` | 読取/生成ファイル | ラベル判定用レシピ・原材料・賞味期限をIDまたはカテゴリ検索で取得。 |
| `label_check_match` | 実行キー必須 | 固定の名称・原材料・製造者から保存済みレシピ候補を照合。必要時は既存AIで候補を解析。 |
| `label_check_ocr` | 実行キー必須 | 確認対象画像を既存ラベルOCRで解析。判定の保存・レシピ変更は行いません。 |
| `label_check_complete` | 実行キー必須 | 確認した期限・レシピ・画像を既存判定式で保存。request_id重複を保護。 |
| `label_check_image` | 読取/生成ファイル | 保存済みラベル画像をIDで取得。 |
| `ingredient_label_analyze` | 実行キー必須 | 確認対象の原材料・栄養成分画像を既存AIで解析し材料DB候補を提示。保存しません。 |
| `ingredient_label_images_save` | 実行キー必須 | 確認済み食材へ原材料・栄養成分画像を保存・登録。 |
| `ingredient_label_update` | 実行キー必須 | 確認済み表示値を既存の許可された食材属性へ反映。 |
| `quote_analyze` | 実行キー必須 | 見積画像/PDFを既存AIで解析し材料DBとの照合候補を提示。原価変更は行いません。 |
| `quote_master_prices_apply` | 実行キー必須 | 確認済み見積価格を食材・資材へ反映し既存処理でレシピ原価を同期。新規名称の重複検査を維持。 |
| `link_image_upload` | 実行キー必須 | リンク集用の確認済み画像を既存ストレージへ保存。任意URLの代理取得は行いません。 |
