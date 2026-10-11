# TSA Data MCP v1.4.0

TSAの専用データ接続を使う独立したSTDIO MCPアダプターです。32ツールを公開し、業務データの検索・変更、レシピ明細一括置換、JAN発行/割当/バーコード、通常画面の計算・取込・帳票・ジョブを扱います。

Node.js 20以上で `npm ci --ignore-scripts`、`npm test` を実行します。配布にはリポジトリの `install.ps1 -Destination <新しい配布先>` を使い、MCPホストから `node <配布先>/server.mjs` を起動します。既存配布先は上書きしません。`codex-config.example.toml` の実行パスを合わせ、`TSA_DATA_API_URL` と `TSA_DATA_API_TOKEN` を保護された実行環境から渡します。トークンをChat、設定例、起動引数、Skillへ記載しないでください。

`business:full` 接続では固定registryの152対象を利用できます。132対象が登録・更新・削除に対応し、JAN管理表を含む20対象は読取専用です。行の変更は `tsa_business_catalog` → `tsa_business_read` → `tsa_prepare_business_change` → `tsa_apply_business_change` の順で、最新versionと確認済み値を使います。JANは専用ツールから発行・割当・情報更新します。接続の権限・期限・失効・対象制限はTSAサーバーが検証します。

計算・取込・帳票・ジョブは次の3ツールを使います。

| ツール | 入力と用途 |
| --- | --- |
| `tsa_operation_catalog` | `{}`。最新の固定操作一覧・説明・更新有無・厳密な入力schema |
| `tsa_run_operation` | `{operation,input,idempotencyKey?}`。カタログの操作を実行。更新・取込・AI分析・ジョブ開始はキー必須 |
| `tsa_get_operation` | `{operationId}` または `{idempotencyKey}`。この接続の実行状態と保存済み結果 |

操作名・入力項目は動的カタログを参照します。任意URL・APIパス・SQL・シェル・認証情報・worker prompt・モデルの上書きは受け付けません。同じキー・同じ入力の再送は再実行しません。通信不明、`running`、`unknown` は元のキーで状態を照会し、新しいキーで重複実行しないでください。ジョブ登録は処理完了ではなく、返却されたジョブIDで結果を確認します。許可済み接続では追加承認不要です。接続のscope・対象制限・期限・失効を維持し、他接続の権限を変更しません。

業務ファイルは許可された `field` と `{filename,mimeType,base64,sha256?}` を渡します。1件3 MiB以下、base64を含む送信JSON全体4 MiB以下、応答4 MiB以下、通信60秒です。大きな原本は既存画面の分割取込を使います。従来のデータツールは入力32 KiB・応答512 KiB・通信15秒の上限を維持します。財務ジョブの原本取得は `source` 限定で、ログ・AI出力・画面画像・保存パス・署名URLは返しません。

外部ECの新規取得・更新はAmazon・楽天・Yahoo・BASEに限定し、退店先は保存履歴の読取だけを扱います。Google・Metaは広告専用です。外部サービスのログイン・MFA・CAPTCHA・許可待ちは既存のoperator waitとして残ります。既存BridgeのSkill・モデル・原本保護を維持し、workerや予約は停止しません。別ホストの配送分析アプリはこの接続の対象外です。

詳細は同梱の `skill/tsa-data-access/SKILL.md` と、リポジトリの `docs/tsa-data-access-mcp.md` を参照してください。
