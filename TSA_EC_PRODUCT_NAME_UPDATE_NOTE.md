# TSA EC Product Name Update Note

## 2026-08-27 EC共通商品名・共通キャッチコピー

- 商品名はEC別に作り分けず、Amazon、楽天、Yahoo、メルカリ、BASE、Qoo10、TikTokへ一字一句同じ文字列を登録する。共通上限は各ECの制約を横断した75文字とする。
- キャッチコピーもサイト別に作り分けず、専用欄がある楽天とYahooへ一字一句同じ文字列を登録する。Yahoo側に合わせた共通上限は30文字とする。
- レシピ詳細には共通商品名と共通キャッチコピーだけを表示し、現在値のEC別一覧は表示しない。既存JSON列は履歴・旧呼び出し互換のため残すが、保存時に共通値から全対象へ同じ値を再構築する。
- GPT-5.6 Solの専用Skillは、各ECのSEO、禁止表現、表示特性、文字数制限を全体として評価し、サイト別候補ではなく共通候補を1件だけ返す。開発Chatや過去タスクは読まない。
- Bridge 1.9.1は共通値と互換JSON、管理者認可の全対象値が完全一致しないジョブを外部操作前に拒否する。ECは従来どおり1件ずつ処理し、未完了だけ再実行できる。

### Verification

- `npm run test:ec-product-name-bridge`: success
- `npm run test:ec-catchcopy-bridge`: success
- `npm run test:bridge-skill-contract`: success
- 変更ファイル対象ESLint: error 0
- `node --check tools/tsa-codex-bridge/bridge.mjs`: success

## 2026-08-24 EC用商品名の個別・一括反映

- レシピ詳細の「EC用商品名」直下に、Amazon、楽天、Yahoo、メルカリ、BASE、Qoo10、TikTokの個別実行と全EC実行を追加した。
- 「今すぐ」は保存済み名称を選択したECへ順次反映する。「一括予約」は複数レシピを外部変更せず保持し、管理者が「予約分をまとめて実行」を確認した時だけ実行する。
- Bridgeは専用Skill `update-aizu-ec-product-names` と構造化入力だけを使用する。価格改定Skillや開発Chatは読み込まない。
- 外部サイトでは商品識別子、学習済みEC商品名、JAN、容量、保存方法を照合し、商品名欄だけを変更する。価格、在庫、送料、税、説明、画像、カテゴリ、バリエーション、広告、一括編集は禁止する。
- ECは1件ずつ処理し、1サイトの失敗で後続ECを止めない。保存後の完全一致を確認できたECだけ成功として記録し、「未完了だけ再実行」で成功済みECを除外する。
- `recipe_ec_product_name_revisions` はレシピに保存した変更前／変更後名称とTSG送信状態を保持する。`recipe_ec_product_name_sync_state` はEC別の最終確認名とジョブを保持し、価格履歴とは混在させない。
- 単品の今すぐ実行は完了後にTSG君が `NEWブランド館（フロア）` へ1投稿する。一括予約から開始した複数商品は、全ジョブ完了後に1投稿へまとめる。決定的投稿IDと送信待ち台帳で二重投稿を防ぐ。
- Bridge 1.8.33は商品名変更protocol 1、進捗率、現在工程、残り時間目安、可視PowerShellモニターに対応する。

### Verification

- `npm run test:ec-product-name-bridge`: success
- `npm run test:ec-price-plan`: success（既存価格変更の回帰）
- `npm run test:ec-product-name-migration -- <production-env>`: success。本番DB上でDDL、RPC、RLS、履歴triggerをtransaction rollback検証。
- `npm run apply:ec-product-name-migration -- <production-env>`: success。本番DBへ対象migrationだけをtransaction適用し、全RPC・権限・protocol条件を確認。
- 適用後の `npm run security:rls`: success。
- `node --check tools/tsa-codex-bridge/bridge.mjs`: success
- `update-aizu-ec-product-names` Skill validation: success
- 対象ESLint: error 0（レシピ詳細の既存warningのみ）
- `npm run predeploy`: success（secret scan、RLS check、production build）

### Remaining limitation

- 実ECの商品名を変える本番テストは、商品情報を書き換えるため自動検証では実施しない。初回の実変更ではEC別の保存確認とTSG投稿を履歴画面で確認する。
