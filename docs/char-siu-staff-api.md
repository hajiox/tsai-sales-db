# DocScanner チャーシュー製造入力 API（2026-10-14）

DocScanner の製造専用HTTPS入口で登録端末を認証し、DocScanner **serverだけ**がTSA専用Bearerを保持する。スタッフブラウザーへBearer、TSAサービスキー、汎用business:fullキーを渡さない。スタッフ名は申告名であり本人確認とは扱わず、端末ID・接続・操作日時とともに記録する。

## 認証と応答

すべてのstaffリクエストに次のheadersを付ける。

- `Authorization: Bearer tsa_csp_<32bytesのbase64url、43文字>`
- `X-DocScanner-Device-Id`: DocScanner serverが端末cookieから確定したASCII ID（8～100文字、英数字・`_`・`-`、UUID可）。ブラウザー申告値をそのまま転送しない。
- `X-DocScanner-Operator-Name`: 申告名をtrim/NFC正規化し、`encodeURIComponent`した値。TSAでdecodeし1～80文字・制御文字なしを確認する。

接続のenabled/revoked_at/expires_atを確認する。allowed_device_ids / allowed_operator_names がNULLならtrusted DocScannerが認証した端末・申告名を受理し、配列が設定されていれば完全一致で制限する。

正常は `{success:true,...}`。エラーは `{success:false,code,error}`（errorは固定説明、写真UPLOAD_FAILEDだけsafe draftを付加）。400 INVALID_INPUT、401 UNAUTHORIZED、403 FORBIDDEN、404 NOT_FOUND、409 REVISION_CONFLICT / IDEMPOTENCY_CONFLICT / COMPLETED / NOT_READY / IN_PROGRESS / UPLOAD_FAILED、503 UNAVAILABLE。DB詳細や原価の失敗理由をstaffへ返さない。

## データ

`input` は次の固定項目だけ。productionDateは実在するYYYY-MM-DD必須。包装日はNULL可だが指定時は煮込み日以降。

```json
{
  "productionDate":"2026-10-14", "packagingDate":null,
  "cookingWorkerCount":2, "cookingWorkHours":3,
  "packagingWorkerCount":null, "packagingWorkHours":null,
  "materials":[{"key":"pork_belly","usageAmount":2000}],
  "outputs":[{"key":"block","quantity":null}], "notes":""
}
```

材料keyはpork_belly/green_onion/ginger/soy_sauce/sake/haimi/granulated_sugar、出来高keyはchashu_wakeari_800/chashu_slice_700/retort_thick_600/retort_medium_380/retort_cut_600/block/lard/minced_chashu。材料はg（soy_sauce/sakeのみml）。固定定義はGETのconfigにも返す。未入力はnullまたは未指定、数量の0は明示0として扱う。入力済み人数は正整数、時間は正の有限number。材料は非負number、出来高は非負整数、各配列はkey重複不可。単価/時給/原価/任意recipeId/scanId/SQLは入力不可。

staff DTOは `{id,revision,status,input,deviceId,operatorName,createdAt,updatedAt,submittedAt,completedAt,runId,photos}`。photosは `{id,fileName,mimeType,size,scanStatus}` だけ。statusはdraft / needs_review / completed。needs_reviewは「管理者の単価確認・正式登録待ち」で、製造原価の登録完了ではない。原価、単価、納品書原文、storage path、token/hashを返さない。

## Staff endpoints

共通prefix: `/api/integrations/docscanner/char-siu-production`

- `GET /`: connection内の最新100draftとconfigを`{success:true,config,drafts}`で返す。`?draftId=<UUID>` は`{success:true,config,draft}`。ほかのconnectionのIDは404。configは `materials:[{key,label,unit}]` と `outputs:[{key,label,unit:"個",unitWeightG}]`。
- `POST /`: JSON `{action:"saveDraft",draftId?:UUID,expectedRevision:0または現在revision,clientOperationId:UUID,input}`。新規はdraftId省略/expectedRevision0。途中入力を保存できる。needs_review再編集はdraftへ戻る。completedは編集不可。
- `POST /`: JSON `{action:"submit",draftId:UUID,expectedRevision:number,clientOperationId:UUID}`。保存済みinputを固定して検証。包装日と4工数すべて、使用材料と出来高が必要。成功はneeds_reviewへ進みmanager待ちとなる。単価を確定せず正式登録しない。
- `POST /photos`: JSON `{draftId:UUID,expectedRevision:number,clientOperationId:UUID,files:[{fileName,mimeType,base64}]}`。ファイル名1～160文字、JPEG/PNG/WebP/HEIC/HEIF、最大4枚・decoded合計3MiB、JSON全体上限4.25MiB。DocScanner serverで画像を縮小して転送する。private bucketへ保存し、既存AI読取と常時manager確認ルールでneeds_review scanを作る。同じoperationの不確定再送で別blob/scan/AIを起動しない。処理中はHTTP202 `{success:true,processing:true,clientOperationId,draft}`、同じoperationを再送して照会できる。原本保存後のAI読取失敗はneeds_reviewとしてHTTP200（管理者確認待ち）。原本保存失敗はHTTP409 `{success:false,code:"UPLOAD_FAILED",error,draft}`で確定失敗を返し、同じoperationは同じ失敗結果を返して再uploadしない。最新draftを確認した利用者の操作だけで新しいoperationを開始する。

mutationのclientOperationIdはconnection内で一意。同じID・同じaction/inputの再送は同じ結果、同じIDで内容を変えると409。revisionが変わったら最新をGETし、利用者が修正内容を確認してから新しいoperation IDで保存する。無条件の上書き再試行をしない。写真やinputを変更したら、改めてsubmitする。写真処理中は同draftの変更・submit・別uploadを409 IN_PROGRESSで拒否し、古い写真を変更後のrevisionへ結ばない。

## TSA manager endpoints

既存管理者セッションのみ。汎用business contextで新しいstaff権限を作らない。

- `GET /api/recipe/char-siu-production/staff-drafts`: `{success:true,drafts:[DTO]}`。DTOはstaff DTOにconnectionId/connectionLabel/scanIdとphotosの管理者認証stream相対URL `url` を追加。
- `POST /api/recipe/char-siu-production/staff-drafts`: `{action:"finalize",draftId,expectedRevision,deliveryNoteScanId,clientOperationId}`。UIはdraftの数量・工程をreadonlyで表示し、既存の納品書確認画面で単価をreadyにしてから実行する。スタッフ入力はこのactionで勝手に変更しない。
- `GET /api/recipe/char-siu-production/staff-drafts/<draftId>/photos/<photoId>`: 管理者のみprivate画像をstream。任意パス/URL指定不可。

正式登録は確認済み同日未使用scan、納品書優先3材料・他4材料DB・TSG単一時給・既存重量按分を使用する。draft/run/全材料/全出来高/scan usedを1transactionで結び、成功時だけcompletedとrunIdを返す。completedのstaff変更・削除は不可、以後の修正は既存管理者画面で行う。

## Provision（公開発行endpointなし）

table `char_siu_staff_connections`: id UUID、label text、token_hash SHA256 hex64（一意）、enabled boolean、revoked_at/expires_at nullable timestamptz、allowed_device_ids/allowed_operator_names nullable text[]、created_by text、created_at/updated_at timestamptz。rootが専用random tokenを生成しhashだけDBへ保存、原本はDocScanner serverの保護ファイルへ渡す。RLS有効、anon/authenticated/PUBLICには表・RPCを許可しない。service_roleだけが限定RPCを実行する。

## 開発時の確認

`node scripts/test-char-siu-staff-api.cjs` と `node scripts/test-char-siu-staff-ui.cjs` は外部接続なしで認証・DTO・再送・管理者操作を検証する。
`node scripts/test-char-siu-staff-db.cjs` はこの開発PCの PostgreSQL 17 (`C:/Program Files/PostgreSQL/17/bin`) だけで隔離DBを生成し、migration・権限・競合・一括確定を検証して専用DBを停止する。本番の設定や資格情報は読まず、試験結果はgit対象外の `.vercel` に保存する。
