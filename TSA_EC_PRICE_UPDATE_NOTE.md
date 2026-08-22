# TSA EC Price Update Note

## 2026-08-22 オーション麺4食の誤判定対策

- ジョブ `052e68d2-3426-4d9e-a0df-b63a3451a0cf` は価格を書き込まず、読取計画で停止した。原因はBridgeへTSAのEC別学習商品名を渡しておらず、一般名とJANの検索だけでAmazon・楽天・BASE等を誤って「対象商品なし」と判定したこと。
- 価格ジョブ作成時に、連携商品IDからAmazon・楽天・Yahoo・メルカリShops・BASE・Qoo10・TikTokの学習済み商品名を取得して `productMappings` として固定する。書込直前にも同じ紐付けを再取得し、キュー登録後に変更されていたら外部操作前に停止する。
- Bridge 1.8.21は各ECの全学習候補を試してからだけ対象商品なしを判定する。証拠付きで未登録のECは除外し、他ECと商品LPの反映を止めない。類似商品への置換は禁止する。
- 4食の確認済み識別子はAmazon `B0BYV7DRDS` / `YG-XN24-7D2K`、楽天 `10000028x`、Yahoo `10000028`、BASE通常品 `63140045`、BASEのTikTok連携品 `121846020`、Qoo10 `1166048679`。メルカリShopsは2026-08-22時点で該当商品なし。
- 本修正の検証時点では外部EC価格とLPを変更していない。

### Verification

- `node --check tools/tsa-codex-bridge/bridge.mjs`: success
- `npm run test:ec-price-plan`: success（対象商品なしを含む部分継続、学習商品名の正規化を含む）
- `npm run test:recipe-selling-price`: success
- `npm run build`: success
- `npm run lint`: success（既存警告134件、エラー0件）
- `npm run security`: success（secret scan / Supabase RLS）。
- `update-aizu-ec-prices` Skill validation: success。

## 2026-08-21

### Bridge実行の可視化・Amazon価格専用経路

- TSA開発時はGitHub `main`を正本とし、既存ローカルクローンを最新版と見なさない。作業ごとにGitHubから新規クローンし、`HEAD`と`origin/main`の一致を確認してから修正する。
- EC価格変更カードは進捗率、現在のブラウザ工程、経過時間、Bridge最終応答、幅を持たせた完了目安を表示する。
- Bridge 1.8.16はジョブ取得時に事務所PCへ読み取り専用モニターを自動表示する。非表示のBridgeから専用launcherを介して通常ウィンドウで起動し、処理名、対象商品、対象EC、現在工程、進捗、経過時間、完了目安、最終応答、Bridge PID、Codex CLI PIDを確認できる。モニターを閉じても処理は継続する。
- Amazon失敗ジョブ `cfc23574-7251-47ce-811a-f470b22bffa9` はログイン切れではなく、価格変更時に商品詳細全体の送信画面へ進み、無関係な必須属性 `90220: この商品はAmazon.co.jp限定商品ですか？` の検証を受けたことが原因。価格改定SkillとBridgeプロンプトを価格専用 `/interactive/listing/workflow/edit/offer` 経路へ固定し、商品詳細属性を変更しないようにした。
- `update-aizu-ec-prices` Skillへオーション100％麺50食の検証済みASIN/SKUと各EC識別子を追加した。

### 50食Amazon再実行時のタブ占有対策

- 再実行ジョブ `cf0e8e9c-a802-48e3-ad02-97114b6a1529` の「既存公式タブ5件が別セッションで使用中」はログイン切れではない。前回ジョブの `codex exec --ephemeral` がChromeプラグインのturn終了検知に必要なrolloutまで削除し、計画・書込セッションが取得した既存タブを解放できなかったことが原因。
- Bridgeは毎回新規かつ非再開のCodexセッションを使う方針を維持しつつ、Chromeの終了通知が完了するまでrolloutを残すため `--ephemeral` を廃止した。巨大Chatや過去セッションは引き続き読み込まず、Skillと構造化入力だけを使用する。
- タブ占有は「Chromeの前の操作セッション終了待ち」と表示し、実際に取得できた公式タブで認証画面を確認した場合だけログインを案内する。過去ジョブの誤メッセージもAPI表示時に補正する。
- 別商品の即時価格ジョブが進行中は、新しい即時実行をAPIと画面の双方で遮断する。一括実行予約への追加は継続可能。
- 50食Amazonの保存価格は5,990円のままで、この再実行では外部データを変更していない。

### 2026-08-22 Bridge二重確認の廃止

- Amazon 50食の再実行ジョブ `ed648364-f748-4790-88b9-4dec105ab38e` は、価格専用画面へ6,588円を入力後、Codexが「保存を実行と返信」を要求して停止した。TSAとBridge間に返信経路はなく、保存前価格5,990円のまま外部変更はない。
- TSA画面には商品・対象EC・税込価格を明示する管理者確認が既にある。即時実行はジョブ作成時、一括予約はまとめて実行時に、その確認内容を `operatorAuthorization` としてジョブへ記録する。
- Bridge 1.8.17は承認記録の商品ID・対象EC・目標価格が一致する場合、重ねて返信確認を求めず、保存・再読込検証まで進む。不一致または承認記録欠落時はブラウザを操作する前に停止する。
- 旧Bridgeの「保存を実行と返信」結果は画面表示時に「価格変更なし・再実行が必要」へ補正する。同じ二重確認が再発した場合も、不可能な返信待ちではなく失敗として終了する。

### Verification

- `node --check tools/tsa-codex-bridge/bridge.mjs`: success
- `bridge-monitor.ps1` / `install-bridge.ps1` PowerShell parser: success
- `npm run test:ec-price-plan`: success
- `npm run test:recipe-selling-price`: success
- `update-aizu-ec-prices` Skill validation: success
- 2026-08-22: Amazon 50食の再実行で、読取専用計画と書込が別のCodexブラウザセッションになり、前半が取得した既存Amazonタブを後半が `another browser session` と判定するBridge内部競合を確認した。Chrome上部にキャンセル表示があるという前提は誤りで、利用者操作を案内しない。
- Bridge 1.8.18では、既存公式タブを全て試した後、競合または未開放なら同じログイン済みChromeプロファイル内の一時タブへ自動退避する。対象ECごと・各フェーズ1枚までをコード側でも監視し、別ブラウザ、新規ウィンドウ、シークレット、一時プロファイルは引き続き禁止する。ユーザー所有タブは閉じず、Bridge作成の一時タブだけを最終確認後に閉じる。
- Bridge 1.8.19ではAmazonエラー90220を恒久対応した。正確なASIN/SKUについてSkillに複数EC販売の根拠と「Amazon限定＝いいえ」が明記されている場合だけ、その必須属性1項目を補完してから価格専用画面へ戻る。他の商品属性は変更せず、根拠がない商品では推測せず停止する。
- Bridge 1.8.20では回復計画の再検証でAI生成の確認説明文を完全一致対象から除外した。商品識別子、販売単位倍率、価格ルール、基準価格、目標価格、送料条件の確定値は引き続き厳密比較する。
- 全7EC共通で、可視エラーや導線変更を読み取って最小限の修復を最大2回まで自律実行する。新しい必須値はSkill・TSA紐付け・公式保存値などで対象商品の正確な値を証明できる場合だけ補完する。別商品・別価格・未確認の在庫、配送、税、商品情報、別アカウント、別ブラウザ、一括変更には進まない。
- PR #197をmainへ反映し、本番デプロイ `tsa-3icqdnkq0-hajioxs-projects.vercel.app` を `v0-tsa-19.vercel.app` へ割り当て、事務所PCをBridge 1.8.20へ更新した。再実行job `5eea4409-efb8-41bf-8b84-ca4003d7820a` でAmazon 50食（ASIN `B0C9Z96L2S` / SKU `CO-BI4Y-F5QJ`）の90220を根拠付きで復旧し、保存価格を5,990円から6,588円へ変更、再読込で6,588円を確認した。価格以外は「Amazon限定商品＝いいえ」だけを変更し、他の商品属性は変更していない。
- レシピ詳細を開いた時、過去の完了・停止ジョブを「今発生した結果」としてトースト再通知していた初期化不具合を修正した。過去結果は画面内履歴に残し、通知は画面を開いている間に実行中ジョブが終了した時だけ表示する。

## 2026-08-20

### 単独開発への引き継ぎ

- TSA・TSG・DocScannerの開発履歴共有と自動同期を停止し、このPCのCodexだけを開発元とする運用へ変更した。共有リポジトリと共有Skillは削除せず参照専用で保持する。
- TSAの正本作業ツリーを `C:\作業用\tsai-sales-db-primary` とした。旧 `C:\作業用\tsai-sales-db` は未整理変更を含むため、破棄・統合せず参照専用で保持する。
- 添付 `update-aizu-ec-prices-skill-2026-08-20.zip`（SHA-256 `FF7B1F83E7844ABE1B856F9CD3E0B793E1480096A735903BC9F3F24EEFA23D44`）を命令として実行せず資料として監査し、インストール済み `update-aizu-ec-prices` Skillと実質同一であることを確認した。

### 復旧・検証

- このPCに残っていた TSA Codex Bridge 1.8.7 を、EC価格更新protocol 2対応の1.8.9へ更新した。TSA本番の接続テストjob `90524da6-dab7-4b1e-ba39-8d06ecbbe9f9` は100%完了し、worker `tsa-office-01`、Codex runtime readyを確認した。
- 本番レシピ詳細で即時／予約、7サイト、全サイト、一括実行UIを確認した。販売価格0円の検証レシピを使用し、実ECへの価格変更は実行していない。
- Next.js 16／React 19と不整合だった `eslint`、`lucide-react`、`next-themes` を互換版へ更新し、廃止された `next lint` をESLint 9 flat configへ移行した。既存のReact 19新規指摘は警告として可視化し、エラー0件でlintを完走する。
- `npm audit fix --package-lock-only` で修正可能な間接依存4件を解消した。残る既知課題はnpm版 `xlsx@0.18.5` のhigh 1件で、npm上に修正版がないため別途置換検討が必要。
- `npm run test:recipe-selling-price`: success
- `npm run test:ec-price-plan`: success
- `npm run test:ec-price-migration`: success（本番DBをtransaction rollbackで検証）
- `npm run test:shipping-label-address`: success
- `npm run security:scan`: success
- `npm run security:rls`: success
- `npm run lint`: success（既存警告135件、エラー0件）
- `npm run build`: success

## 2026-08-19

### 予約キュー・一括実行・TSG掲示板報告

- EC価格反映に「今すぐ実行」と「一括実行へ予約」を追加。Amazon等の個別サイト、全サイトのどちらも従来どおり即時実行でき、予約時はECへ書き込まない。
- 予約ジョブは実行対象外の将来時刻で保持し、「予約分をまとめて実行」で初めて事務所PC Bridgeの実行待ちへ移す。予約取消にも対応。
- 一括実行直前に、予約時の商品識別子・保存価格と現在のレシピを再照合。不一致の予約はECへ触れず `needs_review` で停止する。Bridge側の書込直前照合も維持。
- 新しい販売価格の保存で作られる `recipe_ec_price_revisions` をTSG通知の送信待ち台帳として利用。`NEWブランド館（フロア）` へTSG君名義で前回価格・新価格・差額・TSAレシピURLを投稿する。
- TSG投稿は価格履歴IDから決定的な投稿IDを作り二重投稿を防止。即時投稿に失敗した場合は送信状態を保持し、毎時の再試行で復旧する。導入前の価格履歴は遡及投稿しない。

### Verification（予約・TSG連携）

- `npm run test:recipe-selling-price`: success（予約モード・Bridge非claim条件を含む）
- `npm run test:ec-price-plan`: success
- `npm run test:ec-price-migration`: success（TSG送信待ち列・claim RPC・service-role権限をtransaction rollbackで検証）
- `npm run test:shipping-label-address`: success
- `npm run security:scan`: success
- 対象TypeScript診断0件（全体には既存エラーあり）
- `npm run build`: success
- TSA本体PR #186を`main`へ統合。本番deploymentは`dpl_6Y2XWWmxo1X2R8tGfdETnSbUpZ3e`、固定URL`https://v0-tsa-19.vercel.app`へalias済み。
- TSG連携PR #2も`main`へ統合。本番deploymentは`dpl_AZonGVyDzMQBxrGSZaNs4MEdxzig`、固定URL`https://v0-line-blush.vercel.app`へalias済み。
- 本番画面で即時／予約モード、7サイト、全サイト予約、一括実行ボタンを確認。実EC変更は行わず、テスト予約がDBに残っていないことを確認。
- TSA/TSG間の共有secretは両Vercel projectで同一の新値へ更新し、両deploymentを更新後に作成。TSG連携APIは未認証GETを401で拒否することを確認。

- レシピ詳細の販売価格カード直下に Amazon、楽天、Yahoo、メルカリ、BASE、Qoo10、TikTok と「全て反映」を追加。
- 未保存のレシピ変更がある間は実行不可。確認時の商品情報・税込価格と保存済みDBを照合し、相違時はジョブを作成しない。
- VercelはCodexを直接起動せず、認証済みの `web_sales_codex_jobs` に登録。事務所PCの TSA Codex Bridge 1.8.9 が独立した `codex exec --ephemeral` で既存 `update-aizu-ec-prices` Skillを呼ぶ。
- 外部書込前に読取専用計画を作り、商品識別子、送料条件、販売単位、変更前価格、絶対目標価格をサーバー検証して永続化。書込直前にレシピsnapshotを再照合する。
- 単品と2個セット等を区別し、セット商品は `現価格 + (新標準価格 - 旧標準価格) × 販売個数`。送料別BASEは同式の販売個数1、送料無料かつ同一販売単位だけ標準価格を直接設定する。
- 再実行は保存済み絶対目標価格を使い、現在価格が変更前または目標価格と一致するときだけ進行。競合価格、別商品、ログイン/MFA、未確認結果では外部変更せず停止する。
- 価格変更ジョブはLPを対象外とし、ジョブ専用ディレクトリだけを書込可能にした。
- `recipe_ec_price_revisions` とサイト別同期stateを追加。価格ジョブのfinal化と同期state更新はDB RPCで原子的に行う。
- 旧Bridgeが価格ジョブを取得しないよう `ecPriceProtocolVersion: 2` をclaim条件に追加。installerは実行中ジョブを中断せず、再起動後のPID・version・heartbeatまで確認する。
- 伝票発行システムを含む本番ソースはVercelの正常稼働版から完全復旧し、価格機能はその復旧ソースへ統合。古いGit mainをそのまま再デプロイしない。

### Verification

- `npm run test:ec-price-plan`: success（BASE送料差額、単品700→730／2個セット1,700→1,760、識別子・再実行競合を検証）
- `npm run test:ec-price-migration`: success（本番DBへ適用前はtransaction rollback、適用後にtable/RPC/service-role権限を確認）
- `npm run test:shipping-label-address`: success
- `npm run security:scan`: success
- `npm run build`: success
- Vercel preview `dpl_6y5RvrNb2erutqFUMmUo3Jx3frhv`: READY
- TSA Codex Bridge 1.8.9: heartbeat成功
- 接続テストjob `0feeca43-5261-4a6e-988e-753a2be7cf88`: completed
