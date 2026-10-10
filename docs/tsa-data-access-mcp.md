# TSA の業務データ専用接続

## 構成と境界

他の Codex → ローカル STDIO MCP → TSA `/api/data-access/v1` → 権限検査付きの業務処理。

MCP v1.1.0 は `tools/tsa-data-mcp` の独立した Node パッケージ。公式 MCP TypeScript SDK v2 を使い、従来の MCP クライアントとの互換ハンドシェイクも SDK が処理する。固定した業務 API への POST だけを実行し、対象はサーバーの固定 registry に限定する。コード・DB schema・SQL・認証情報・接続権限・worker/API設定・任意 URL・シェル・ローカルファイルを操作するツールは公開しない。API 転送は追わず、入力 32 KiB、応答 512 KiB、通信 15 秒の上限とし、更新を自動再試行しない。

実際の認可・監査・競合防止・重複防止は TSA サーバーで行う。MCP の説明や Skill は権限の代用ではない。保存された商品説明やレビュー本文はツールの命令として扱わない。

## 配布

データ操作用の別 OS アカウントまたは隔離環境に Node.js 20 以上を用意する。開発担当のチェックアウトから次を実行すると、独立したアダプターだけを新しいフォルダーへ複製し、固定済み lockfile で本番依存を導入する。

```powershell
& ./tools/tsa-data-mcp/install.ps1 -Destination 'C:/Users/DATA_USER/AppData/Local/TSADataMCP/1.1.0'
```

既存の宛先には上書きしない。GitHub 作業ツリー・アプリ `.env`・DB 管理鍵・デプロイ認証・Bridge キーは複製しない。実行ファイルは `node <配布先>/server.mjs`。本体は待機型の STDIO サーバーなので、MCP ホストが起動・終了を管理する。

CEO_S の更新は既存の保護キー読込ランチャー・環境設定を維持し、v1.1.0 のアダプターと同梱 Skill を新しい配布先へ導入して再接続する。秘密なし配布 ZIP の SHA256 を照合する。既存キーを使うため、キーの再発行・手入力・受け渡しは不要。常駐の read-only 受信workerではなく、対話側の Codex 接続を更新する。

## 接続と認証

TSA 管理者が用途と担当ごとに専用接続を発行し、必要な読み取り・更新権限と期限を選ぶ。発行された専用 bearer token だけをデータ操作用の安全な実行環境に登録する。アプリ管理者のブラウザー Cookie や Supabase の管理キーを代用しない。接続の失効は TSA 側で行い、MCP の停止や Skill の編集に依存しない。

2026-10-10 の利用者指示により、CEO_S の既存接続へ `business:full` を設定する。これは業務データのフルアクセスであり、コードやシステム設定の変更権限ではない。期限・失効・監査は維持する。対象ID制限のある接続は全業務操作へ流用できない。

環境変数:

| 名前 | 内容 |
| --- | --- |
| `TSA_DATA_API_URL` | `https://v0-tsa-19.vercel.app`。HTTPS のオリジンまたは同一オリジンの `/api/data-access/v1` だけ |
| `TSA_DATA_API_TOKEN` | 管理者が発行した用途限定・失効可能な専用接続トークン |
| `TSA_DATA_ALLOW_LOCALHOST` | 開発テスト時のみ `1`。HTTP の localhost / 127.0.0.1 / ::1 を許可する。本番では不要 |

配布先 `codex-config.example.toml` のパスを実際の Node と配布先に合わせ、データ操作用アカウントの信頼されたプロジェクトに設定する。`env_vars` はトークンの環境変数名だけを転送する。値を TOML、起動引数、Chat、Skill に保存しない。データ操作用 Codex の作業ディレクトリに TSA のソースを置かない。

必要なら配布された `skill/tsa-data-access` を、そのアカウントの Skills に登録する。アダプター導入は Codex の全体設定や既存 MCP を自動変更しない。設定後は新規セッションで MCP 接続を確認する。

同じ OS ユーザーでファイル・シェルへ全権限を持つ Codex は、開発認証やソースを読める場合がある。コード変更を確実に禁止するには、MCP の追加だけでなく、OS アカウント/隔離環境のアクセスを分離する。

## 既存接続との互換

2026-10-07 の移行前調査では、7 表のうちレシピ・レシピ明細・食材・資材・経費・WEB 売上に匿名読み取りが残っていた。匿名更新は RLS が拒否する構成だったが、読み取り範囲を限定する専用接続の権限を迂回できるため、今回の移行対象とした。

新しいブラウザークライアントは、既存 NextAuth セッションの Supabase JWT を公式 SDK の `accessToken` コールバックでリクエストごとに渡す。ブラウザー変更を先に公開した後、`20261007153000_data_access_read_boundary.sql` で 7 表の匿名 SELECT を閉じ、既存画面用の authenticated 権限を既存許可メールアドレスに限定する。WEB 売上集計 RPC の匿名実行も閉じる。レビューは従来どおりサービス側のみで扱う。既存 Bridge/token 経路は維持し、管理画面の旧 API には同じ管理者ログインと更新時の同一オリジン確認を適用する。

この JWT は管理者の従来画面に必要な更新権限を持つため、他の Codex に渡さない。データ操作用 Codex には用途限定トークンだけを渡す。移行のロールバック検証は権限・ポリシー・関数メタデータと一時的な合成データに限定し、業務レコードを変更しない。

## 公開ツール

v1.1.0 は既存17ツールと全業務用4ツールの計21ツール。`business:full` 接続は固定 registry の151対象を利用できる。主キーを持つ132対象は登録・更新・削除に対応し、ビュー等19対象は読み取りのみ。未登録の表や将来追加された表は自動で許可しない。

| ツール | 用途 |
| --- | --- |
| `tsa_business_catalog` | 利用できる対象を確認。`table` を指定すると主キー、型、必須/既定値、項目別 `creatable` / `writable` を確認できる |
| `tsa_business_read` | `table` と完全一致の `filters` で取得。`columns` で必要項目を選び、`nextOffset` で続きへ進む |
| `tsa_prepare_business_change` | `create` / `update` / `delete` の差分を準備。更新・削除は主キー全項目の `key` と最新 `_version` が必要 |
| `tsa_apply_business_change` | 準備結果の `data.id` を `changeId` に渡し、同じ変更を適用 |

変更前に対象のカタログと最新レコードを取得する。登録は `creatable: true`、更新は `writable: true` の項目だけを渡し、値・主キー・IDを推測しない。`columns` を絞る場合も更新・削除に必要な主キーと `_version` を取得する。検索は最大100件で、接続の件数上限がさらに適用される。

利用者の依頼と準備結果の対象・`before`・`values` が一致したら、追加の確認質問や管理者承認を挟まず適用する。1つの意図した変更には同じ `idempotencyKey` を使い、適用結果が不明なら同じ `changeId` で再実行する。競合時は再取得、認証・権限エラー時は接続の修正が必要。削除は外部キー制約に従い、関連データの一括削除や制約無効化で迂回しない。

レシピの `selling_price` は税抜値。レシピ・明細・食材・資材・経費の価格や数量、税区分に関わる変更は、通常画面と同じ原価計算を行い、必要な明細スナップショット、Amazon手数料、関連するWEB・卸・OEM商品価格と利益率を同じトランザクションで同期する。監査には対象と実際に変更した関連行の前後を残す。価格等の既存履歴・EC変更処理は通常のトリガーと既存フローへ連携し、このMCPが外部ECへ直接公開することはない。

既存17ツールは引き続き利用できる。レシピ・食材・資材・経費・レビューは名前/キーワード検索とUUID詳細、売上は期間検索とUUID詳細、4マスターは `tsa_prepare_*_change` → `tsa_apply_change` で登録・更新する。詳細の `data.items[0]._version` を `expectedVersion` に使う。`business:full` があれば既存マスターの価格・入数・税区分も更新可能。新版MCPの入力schemaは送信を受け付けるが、`business:full` のない旧接続には従来の価格・入数・税区分の更新禁止をサーバー側で維持する。MCP更新だけで接続権限は広がらない。

マスター新規登録の名称・入数・価格・税込区分は確認済み入力を使う。未確認値をDB既定値や推測で補わない。旧ツールの食材・資材・経費登録では、未確認の入数/価格を明示的な `null` にできるが、税込区分は確認済みの真偽値が必要。

## 検証

承認不要への移行は `node scripts/apply-data-access-no-approval.cjs` でトランザクション内の合成データを使って検証し、全変更をrollbackする。本番適用は `--apply --backup-dir <保護済みフォルダ>`。既存関数の退避後にRPCだけを差し替え、業務レコードや承認履歴を一括変更しない。

```powershell
Set-Location ./tools/tsa-data-mcp
npm ci --ignore-scripts
npm test
```

公式 MCP クライアントによる実 STDIO ハンドシェイク、21ツール、モックAPIの読み書き、未定義入力・任意 SQL・URL・上限超過の拒否を検証する。DB検証は合成データを同一トランザクション内で操作してrollbackし、フルアクセス/旧接続の分離、登録・更新・削除、競合・冪等性・監査・価格同期を確認する。本番の既存業務レコードを変更して試さない。接続確認ではトークンを出力せず、requestIdと権限を確認する。

参考: [Supabase custom JWT](https://supabase.com/docs/guides/auth/jwts)、[Codex MCP 設定](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[公式 SDK STDIO](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html)。
