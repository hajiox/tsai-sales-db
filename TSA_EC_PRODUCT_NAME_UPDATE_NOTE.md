# TSA EC Product Name Update Note

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
