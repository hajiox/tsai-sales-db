# TSA EC Price Update Note

## 2026-08-21

### Bridge実行の可視化・Amazon価格専用経路

- TSA開発時はGitHub `main`を正本とし、既存ローカルクローンを最新版と見なさない。作業ごとにGitHubから新規クローンし、`HEAD`と`origin/main`の一致を確認してから修正する。
- EC価格変更カードは進捗率、現在のブラウザ工程、経過時間、Bridge最終応答、幅を持たせた完了目安を表示する。
- Bridge 1.8.15はジョブ取得時に事務所PCへ読み取り専用モニターを自動表示する。処理名、対象商品、対象EC、現在工程、進捗、経過時間、完了目安、最終応答、Bridge PID、Codex CLI PIDを確認でき、モニターを閉じても処理は継続する。
- Amazon失敗ジョブ `cfc23574-7251-47ce-811a-f470b22bffa9` はログイン切れではなく、価格変更時に商品詳細全体の送信画面へ進み、無関係な必須属性 `90220: この商品はAmazon.co.jp限定商品ですか？` の検証を受けたことが原因。価格改定SkillとBridgeプロンプトを価格専用 `/interactive/listing/workflow/edit/offer` 経路へ固定し、商品詳細属性を変更しないようにした。
- `update-aizu-ec-prices` Skillへオーション100％麺50食の検証済みASIN/SKUと各EC識別子を追加した。

### Verification

- `node --check tools/tsa-codex-bridge/bridge.mjs`: success
- `bridge-monitor.ps1` / `install-bridge.ps1` PowerShell parser: success
- `npm run test:ec-price-plan`: success
- `npm run test:recipe-selling-price`: success
- `update-aizu-ec-prices` Skill validation: success
- 本番ビルド、Bridge更新、Amazon再実行、本番画面確認はデプロイ工程で追記する。

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
