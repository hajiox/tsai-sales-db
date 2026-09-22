# ネット専用レシピのレビュー（2026-09-21）

レシピ詳細のレビュータブ。Amazon/楽天/Yahoo/BASEの商品レビューをEC別と全体集約で表示。商品紐付けの安定IDを優先し、既存の商品名対応と最新ABCDの完全一致・検証済みJANレジストリからも補完する。曖昧検索はしない。手動の収集元設定を保存できる。退店ECは対象外。

収集は専用Skill collect-aizu-reviews、新規隔離Codex Bridge。既存Chrome連係→接続不可の具体的証拠がある場合1回だけtask-scoped DevTools。隔離ジョブでnative PC操作は提供せず、ログイン/MFA/許可待ちは未取得として報告する。返信・投稿・価格変更なし。各商品最新順最大200件、制限はpartial。サイトレビュー・ショップレビューは混ぜない。親子ASIN等の共有範囲は取得状況に明記。

recipe_reviews はレシピ/EC/商品番号/外部レビューIDで一意。更新レビューをupsert。収集結果と分析予約はRPCで同時保存。レビューなしと未取得は別状態。既存値は未取得時に消さない。

分析は専用Skill analyze-aizu-reviews、gpt-6-astra/medium。保存済みレビューを各EC最新50件、本文800字/見出し300字までの固定スナップショットにし、対象件数・範囲・偏りを明記。全体とデータのある各ECの結果を保存。各指摘は同scopeの実在レビューID必須。原文一覧はDB保存全文、分析根拠は分析当時の抜粋。分析後の追加/更新は古い分析の警告を表示。

DB/APIは管理者・service_role限定、RLS有効、anon/authenticated直接アクセス不可。worker/task/status/leaseを検証。画面は15秒更新、原文30件/ページ、全体平均は全保存レビューの評価あり件数で加重（EC平均の単純平均にしない）。原文の個人プロフィールは取得しない。

Migration: scripts/apply-recipe-reviews-migration.cjs（既定rollback、--applyで本番反映）。
Tests: scripts/test-recipe-reviews.cjs、scripts/test-recipe-reviews-db.cjs（migration＋RPC重複/worker検証をrollback）、Bridge skill/monitor tests、型検査、lint、predeploy。
Bridge追加はversion 1.9.98の新capability recipeReviewsProtocol=1で分離。既存ジョブ契約は不変。インストーラーはinteractiveに収集、analysisに分析を配布。全体集約は当該レシピの全EC分であり、全レシピ横断ではない。

## 全商品一括巡回（2026-09-22）
ネット専用一覧のReviewBatchから /api/recipe/reviews/batch を実行。全ネット専用レシピの既存収集元を固定し、service_role専用RPCでバッチと収集ジョブを同一transaction登録。実行中バッチの重複クリックは同じIDを返し、個別収集ジョブも再利用する。紐付けなし/不正URLは理由付きで対象一覧へ保存。画面を閉じても既存collect/analyze専用Skillの隔離Bridgeジョブが継続する。PC停止・ログイン・許可待ちは従来どおり待機/要確認。新しいworkerタスクやSkillは追加せず既存契約を利用。
一覧は15秒ごとに収集と後続分析（reviews-analysis:収集ID）の状態を集計。部分取得・失敗・未設定は完了と分離。同商品に分析待ち/実行中がある間は収集claimを保留し、分析予約の競合消失を防ぐ。
Migration: scripts/apply-review-batch.cjs（既定rollback、--applyで適用。適用後は再実行しない）。Tests: scripts/test-review-batch.cjs、migration rollbackで登録/重複/未設定/RLS確認。
