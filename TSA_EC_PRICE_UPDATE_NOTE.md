# TSA EC Price Update Note

## 2026-08-19

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
