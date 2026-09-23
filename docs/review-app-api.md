# Codexアプリ直接レビューAPI

2026-09-23。TSA Bridge・Codex CLIを起動せず、現在のCodexアプリが取得したレビューと分析を保存する内部API。

- `GET /api/recipe/reviews/direct?batchId=<UUID>`: 既存バッチの対象と実結果。`jobId`は元の収集ID、`effectiveJobId`は最新取込の監査ID。
- `GET ...?jobId=<元の収集UUID>`: 固定sources、未取得pendingSources、既存レビューID、coverage、sourceHash、expectedCollectionId、競合するactiveジョブ。
- `GET ...?jobId=<UUID>&analysis=1`: 保存済みレビューの固定分析packetを追加。
- `POST ...`: `{mode:"collection"|"analysis",jobId,requestId,expectedCollectionId,sourceHash,data,model?}`。requestIdは操作ごとのUUID。同じJSONの再送だけを冪等に処理し、異なる内容を同じIDでは保存しない。

認証は専用の`TSA_REVIEW_APP_TOKEN`（32文字以上）のBearer。Bridgeトークンは利用しない。環境変数がなければ閉じた状態。トークンは画面・ログ・Git・作業メモに記録しない。このAPI以外の操作権限を付与しない。

## このPCからの利用

`scripts/review-app-api.mjs`はHTTP呼出だけをする。設定はユーザー専用`~/.codex/tsa-review-app.json`のtoken、または環境変数。接続先は本番TSA固定、リダイレクト不可。

```powershell
node scripts/review-app-api.mjs batch <batchId> --output <absolute-json-path>
node scripts/review-app-api.mjs packet <jobId> --output <absolute-json-path>
node scripts/review-app-api.mjs import <absolute-result-envelope-path>
node scripts/review-app-api.mjs analysis-packet <jobId> --output <absolute-json-path>
```

収集dataは既存`review-collection.schema.json`と同じ。sourcesには今回確認した未取得sourceだけを含めてよい。未送信sourceの過去のcoverageを引継ぎ、確認履歴なしはblocked。取得済みcomplete/no_reviewsの再実行は拒否。sourceHashはpacketの値。サイト・商品同一性、本文原文、公式固有ID/固定リンク、終端確認はcollect-aizu-reviewsの基準に従う。IDは作らず、認証・MFA・CAPTCHA・許可待ちは迂回しない。作業用に作った不要タブだけを閉じる。

分析dataは既存`review-analysis.schema.json`。sourceHashはanalysis.sourceHash、modelは実際に分析したモデル名。保存済み根拠IDだけを使う。保存時点でレビュー・収集元・最新収集が変わった場合409。packetを再取得し、必要な作業だけ判断する。解析を自動実行せず、分析未保存は完了扱いしない。

監査ジョブはtransaction内で終端状態として作る。過去ジョブ・過去分析は書換えず、Bridgeにclaimさせない。バッチ画面は最新の直接取込を表示する。再開待ちや失敗の元ジョブを再queueしない。紐付け未設定の商品は明示的な収集元設定を別途必要とする。

migration: `node scripts/apply-review-app-api.cjs`は全変更rollbackで検証、`--apply`は1回のみ適用。API入力テスト: `node scripts/test-review-app-api.cjs`。
