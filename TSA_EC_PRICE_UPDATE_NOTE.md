# TSA EC Price Update Note

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
