# WEB売上・費用の公式API取得

管理画面 `/web-sales/automation` の取得要求とcronは共通dispatcherを通る。設定済み公式APIを優先し、未対応・未接続の対象は既存の公式ファイル取得へ回す。API認証失敗後に別経路へ自動切替しない。メルカリ・Qoo10・TikTokは新規取得対象外。

画面の「次回」は接続設定、「保存」は実際に保存した原本の経路。「API: 要確認」は未確定の取得結果であり、保存済みCSVをAPIとして表示しない。過去データに経路の証跡がない場合は経路未確認とする。

## このPCの取得処理

`npm run finance:api-worker` は公式APIを順次呼び出す決定論的な処理。Codex CLIやAIモデルは起動しない。Yahoo注文APIの1秒間隔と大量注文に対応するため、Vercelでは待機登録のみ行う。単発運用は `node scripts/run-finance-api-queue.cjs --once`。通常ChromeやBridgeの起動を要求しない。

workerはDBの状態と共通モニターへ30秒ごとに状態を送信する。画面にPC停止を表示し、worker生存を取得成功として扱わない。定期実行は `WEB_SALES_AUTO_ACQUISITION_ENABLED=true` の場合だけ。既定は停止中。

## 接続と保存

接続設定は `/web-sales/automation/api-connections`。管理者本人に限定し、既存の鍵は返さない。暗号化キー `FINANCE_API_CREDENTIAL_ENCRYPTION_KEY` はサーバー専用の32byte base64。AES-256-GCMと設定名のAADで暗号化し、service_roleだけが接続テーブルへアクセスできる。APIトークンの更新前に永続化先を確認する。値をログ・共有Skill・操作記録に書かない。

AmazonはSP-APIと広告APIを別認可。楽天は店舗所有アプリのsearchOrder/getOrderを利用。Yahooは注文APIの本番許可とストア認可、BASEはread_users/read_orders、費用にはread_savingsが必要。Metaは広告アカウントのads_readが必要。本人操作の確認、ログイン、権限申請は迂回しない。

Yahooの既存アプリは接続設定の「Yahoo!のAPI認証へ進む」から認可する。登録済みの本番callbackのみ使用し、管理者本人・10分の暗号state Cookie・PKCEを確認して更新トークンを保存する。OAuth成功だけで注文APIの本番許可があると判断せず、実取得で確認する。定期実行はこの操作でも再開しない。

Yahoo注文APIは接続元のグローバルIPにも許可が必要。`source_ip_not_allowed` は公式のIP追加・変更申請待ちであり、ログインの繰り返しでは解消しない。`business_id_not_registered`、`seller_not_allowed`、`order_api_not_approved` も操作待ちとして扱う。プロバイダのエラー原文は保存せず、公式の既知コードを固定カテゴリに変換する。

## 金額と再実行

APIとBridgeの同種・同媒体・重なる期間をDBで排他制御。同期間のAPI保存完了は再実行しない。明示的な手動要求だけが失敗・確認待ちを再開する。

売上は公式取引の実金額を使用し、商品マスター価格で補わない。既存月次がある場合は総額・個数・商品別の一致を同一トランザクションで確認する。注文基準と公式集計原本の基準が未確認のとき、新規月も確認待ちにする。月途中のAPIは明細を保存するだけで月次全体を置換しない。

クーポン負担者・配賦が不明な注文は理由と件数を残し、検証済みの他明細を確認用に保存する。通信失敗・ページ欠落を部分成功と扱わない。既存の確定EC精算は保護し、広告費は他媒体の費用と既存原本を原子的に保持する。楽天BillPay/RPPとYahooの未確認精算・アイテムリーチは公式ファイル取得を残す。

## 検証

`npm run test:finance-api`、変更ファイルlint、`npm run security`、`npm run build`。SQLはservice_role以外の実行権を閉じ、適用前のrollback検証と適用後の権限・排他・差額保護を確認する。本番検証では既存の9月売上・広告費が不意に変わらないことを確認する。
