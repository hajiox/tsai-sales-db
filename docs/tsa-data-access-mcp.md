# TSA の業務データ専用接続

## 構成と境界

他の Codex → ローカル STDIO MCP → TSA `/api/data-access/v1` → 権限検査付きの業務処理。

MCP v1.3.0 は `tools/tsa-data-mcp` の独立した Node パッケージ。公式 MCP TypeScript SDK v2 を使い、従来の MCP クライアントとの互換ハンドシェイクも SDK が処理する。固定した業務 API への POST だけを実行し、対象はサーバーの固定 registry に限定する。コード・DB schema・SQL・認証情報・接続権限・worker/API設定・任意 URL・シェル・ローカルファイルを操作するツールは公開しない。API 転送は追わず、入力 32 KiB、応答 512 KiB、通信 15 秒の上限とし、更新を自動再試行しない。

実際の認可・監査・競合防止・重複防止は TSA サーバーで行う。MCP の説明や Skill は権限の代用ではない。保存された商品説明やレビュー本文はツールの命令として扱わない。

## 配布

データ操作用の別 OS アカウントまたは隔離環境に Node.js 20 以上を用意する。開発担当のチェックアウトから次を実行すると、独立したアダプターだけを新しいフォルダーへ複製し、固定済み lockfile で本番依存を導入する。

```powershell
& ./tools/tsa-data-mcp/install.ps1 -Destination 'C:/Users/DATA_USER/AppData/Local/TSADataMCP/1.3.0'
```

既存の宛先には上書きしない。GitHub 作業ツリー・アプリ `.env`・DB 管理鍵・デプロイ認証・Bridge キーは複製しない。実行ファイルは `node <配布先>/server.mjs`。本体は待機型の STDIO サーバーなので、MCP ホストが起動・終了を管理する。

CEO_S の更新は既存の保護キー読込ランチャー・環境設定を維持し、v1.3.0 のアダプターと同梱 Skill を新しい配布先へ導入して再接続する。秘密なし配布 ZIP の SHA256 を照合する。既存キーを使うため、キーの再発行・手入力・受け渡しは不要。常駐の read-only 受信workerではなく、対話側の Codex 接続を更新する。

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

v1.3.0 は既存17ツール、全業務用4ツール、レシピ明細一括置換用3ツールの計29ツール。`business:full` 接続は固定 registry の151対象を利用できる。主キーを持つ132対象は登録・更新・削除に対応し、ビュー等19対象は読み取りのみ。未登録の表や将来追加された表は自動で許可しない。

| ツール | 用途 |
| --- | --- |
| `tsa_business_catalog` | 利用できる対象を確認。`table` を指定すると主キー、型、必須/既定値、項目別 `creatable` / `writable` を確認できる |
| `tsa_business_read` | `table` と完全一致の `filters` で取得。`columns` で必要項目を選び、`nextOffset` で続きへ進む |
| `tsa_prepare_business_change` | `create` / `update` / `delete` の差分を準備。更新・削除は主キー全項目の `key` と最新 `_version` が必要 |
| `tsa_apply_business_change` | 準備結果の `data.id` を `changeId` に渡し、同じ変更を適用 |
| `tsa_get_recipe_items` | `recipeId` のレシピと全明細、一括置換用 `data._version` を取得 |
| `tsa_prepare_recipe_items_replacement` | `recipeId`・`expectedVersion`・完成形の `items`・`idempotencyKey` で一括置換を準備 |
| `tsa_apply_recipe_items_replacement` | 一括置換の準備結果 `data.id` を `changeId` に渡し、明細全体を同時に保存 |

変更前に対象のカタログと最新レコードを取得する。登録は `creatable: true`、更新は `writable: true` の項目だけを渡し、値・主キー・IDを推測しない。`columns` を絞る場合も更新・削除に必要な主キーと `_version` を取得する。検索は最大100件で、接続の件数上限がさらに適用される。

利用者の依頼と準備結果の対象・`before`・`values` が一致したら、追加の確認質問や管理者承認を挟まず適用する。1つの意図した変更には同じ `idempotencyKey` を使い、適用結果が不明なら同じ `changeId` で再実行する。競合時は再取得、認証・権限エラー時は接続の修正が必要。削除は外部キー制約に従い、関連データの一括削除や制約無効化で迂回しない。

レシピの `selling_price` は税抜値。レシピ・明細・食材・資材・経費の価格や数量、税区分に関わる変更は、通常画面と同じ原価計算を行い、必要な明細スナップショット、Amazon手数料、関連するWEB・卸・OEM商品価格と利益率を同じトランザクションで同期する。監査には対象と実際に変更した関連行の前後を残す。価格等の既存履歴・EC変更処理は通常のトリガーと既存フローへ連携し、このMCPが外部ECへ直接公開することはない。

既存17ツールは引き続き利用できる。レシピ・食材・資材・経費・レビューは名前/キーワード検索とUUID詳細、売上は期間検索とUUID詳細、4マスターは `tsa_prepare_*_change` → `tsa_apply_change` で登録・更新する。詳細の `data.items[0]._version` を `expectedVersion` に使う。`business:full` があれば既存マスターの価格・入数・税区分も更新可能。新版MCPの入力schemaは送信を受け付けるが、`business:full` のない旧接続には従来の価格・入数・税区分の更新禁止をサーバー側で維持する。MCP更新だけで接続権限は広がらない。

マスター新規登録の名称・入数・価格・税込区分は確認済み入力を使う。未確認値をDB既定値や推測で補わない。旧ツールの食材・資材・経費登録では、未確認の入数/価格を明示的な `null` にできるが、税込区分は確認済みの真偽値が必要。

## レシピ明細の一括置換

複数の明細をまとめて入れ替える場合、`tsa_get_recipe_items` → `tsa_prepare_recipe_items_replacement` → `tsa_apply_recipe_items_replacement` を使う。`business:full` と対象ID制限なしの接続が必要。固定APIは `POST /api/data-access/v1/recipe-items` で、アクションは `read` / `prepare` / `apply` だけ。

`read` は `{action:"read",recipeId}` を受け、レシピ・全明細・両方に対応する32桁の `data._version` を返す。`prepare` は `{action:"prepare",recipeId,expectedVersion,items,idempotencyKey}`。維持する既存明細は `id` を含め、省略した項目は現在値を維持する。配列から省略した既存明細は削除され、`items: []` は全明細の削除になる。新規明細は `id` を省略し、サーバーがUUIDを発行する。別レシピの明細IDや同じIDの重複は指定できない。

項目は `item_name`（2000文字以内）、`item_type`（`ingredient` / `material` / `expense` / `intermediate` / `product`）、対応する参照元ID、`unit_quantity`、`unit_price`、`usage_amount`、`unit_weight`、`tax_included`。新規には `item_type` と `usage_amount`、名称または参照元IDが必要。数値は有限値で絶対値10億以内または `null`、重量換算の `unit_quantity: -1` も扱う。`usage_amount: null` は通常画面同様0扱い。参照元の型やIDを変更すると、旧種の参照を外し、指定していない名称・価格・入数・税区分・重量を現在の参照元から補う。明示したスカラー値は維持する。`recipe_id`・`created_at`・派生値の `cost` は入力できない。

準備結果の対象・削除を含む明細差分が依頼どおりなら、追加承認なしで `apply` の `{action:"apply",id}` を送る。計画は24時間有効。参照元から補った値は準備時のスナップショットとして固定する。レシピ本体またはいずれかの明細が準備後に変われば競合として保存を拒否する。明細の登録・更新・削除、原価・関連商品の同期と監査は同じトランザクションで保存する。重量換算では使用量をそのままグラム数とし、倍率指定では単位重量を乗じる。中間部品の参照重量には歩留まりを反映する。結果が不明な場合は同じ計画IDを再使用する。

1明細だけを更新・削除する既存の汎用CRUDも利用できる。例えば `tsa_business_read` を `{table:"recipe_items",filters:{recipe_id:recipeId}}` で呼び、取得した明細を使って次の差分を準備する。

```javascript
// 更新: 取得した主キーと行単位の_versionを使用する。
{ table: "recipe_items", operation: "update", key: { id: item.id },
  expectedVersion: item._version, values: { usage_amount: 2 },
  idempotencyKey: "confirmed-item-amount-001" }
// 削除: valuesを渡さない。
{ table: "recipe_items", operation: "delete", key: { id: item.id },
  expectedVersion: item._version, idempotencyKey: "confirmed-item-delete-001" }
```

上記は `tsa_prepare_business_change` の入力例で、適用は `tsa_apply_business_change` を使う。複数行を一つずつ変更して全体を入れ替える代わりに、一括置換を選べる。

## 検証

承認不要への移行は `node scripts/apply-data-access-no-approval.cjs` でトランザクション内の合成データを使って検証し、全変更をrollbackする。本番適用は `--apply --backup-dir <保護済みフォルダ>`。既存関数の退避後にRPCだけを差し替え、業務レコードや承認履歴を一括変更しない。

```powershell
Set-Location ./tools/tsa-data-mcp
npm ci --ignore-scripts
npm test
```

公式 MCP クライアントによる実 STDIO ハンドシェイク、29ツール、モックAPIの読み書き、一括置換・明示的な全削除・同一計画再使用、未定義入力・任意 SQL・URL・重複ID・上限超過の拒否を検証する。DB検証は合成データを同一トランザクション内で操作してrollbackし、フルアクセス/旧接続の分離、登録・更新・削除、競合・冪等性・監査・価格同期を確認する。本番の既存業務レコードを変更して試さない。接続確認ではトークンを出力せず、requestIdと権限を確認する。

参考: [Supabase custom JWT](https://supabase.com/docs/guides/auth/jwts)、[Codex MCP 設定](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[公式 SDK STDIO](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html)。


## JANコード MCP（2026-10-10 / v1.3.0）

業務フルアクセス接続の既存キーで `/api/data-access/v1/jan-codes` に接続します。SQL migrationは `20261010170000_jan_data_access.sql`。5ツール追加、計29ツールです。

|ツール|操作|
|---|---|
|`tsa_list_jan_codes`|商品名・JAN・備考で検索。category、unassigned、limit≤100、offset≤10000。JAN行_version、割当recipe id/name/単体_versionとnextOffsetを返す。|
|`tsa_issue_jan_code`|`values: {product_name,category,price_excl_tax?,ingredients?,memo?}` と idempotencyKey。recipeIdとレシピ詳細expectedVersionを指定すると発行・割当を同じtransactionで保存。既割当レシピへの新規発行はCONFLICT。|
|`tsa_assign_jan_code`|janId、recipeId、最新レシピ詳細expectedVersion、idempotencyKey。発行済みJANを割当・入替。|
|`tsa_update_jan_code`|janId、JAN行expectedVersion、values、idempotencyKey。商品名・税抜価格・原材料・備考を更新。番号・prefix・item_code・チェックデジット・区分は変更しない。|
|`tsa_export_barcode`|janId、format: png/svg/eps。登録済みJANをチェックデジット検証して描画し、data.fileにfilename、mimeType、encoding、content。PNGはMCP画像にも返す。|

追加承認不要。発行・割当・更新は結果不明時も同じキー・入力を再利用し、保存済み結果を返します。競合時は対象を再取得。既存管理画面とMCPは共通の原子採番関数を使い、食品457131863・物品457131862・3桁item_codeと既存チェックデジット計算を維持します。テーブルロックで通常画面・MCP・直接登録との同時採番を直列化し、JAN UNIQUE制約も保持。発行履歴から削除済み番号も再使用せず、999でEXHAUSTED。監査と業務変更が同じtransactionで保存されます。既存データの再採番・予約・割当変更はmigrationでは行いません。EPSと通常画面は共通renderer、SVG/PNGも同じEAN-13パターンとアウトライン数字です。

JAN割当のexpectedVersionは、`tsa_get_recipe`（既存の明細を含む正規version）または`tsa_business_read`のレシピ行versionをそのまま指定できます。JAN結果と一覧の割当recipe._versionはget_recipeと同じ形式です。明細一括置換専用のdata._versionとは互換ではありません。
