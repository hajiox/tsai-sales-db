# ネット専用レシピのレビュー（2026-09-21）

レシピ詳細のレビュータブ。Amazon/楽天/Yahoo/BASEの商品レビューをEC別と全体集約で表示。商品紐付けの安定IDを優先し、手動の収集元設定を保存できる。退店ECは対象外。

収集は専用Skill collect-aizu-reviews、新規隔離Codex Bridge。既存Chrome連係→接続不可の具体的証拠がある場合1回だけtask-scoped DevTools。隔離ジョブでnative PC操作は提供せず、ログイン/MFA/許可待ちは未取得として報告する。返信・投稿・価格変更なし。各商品最新順最大200件、制限はpartial。サイトレビュー・ショップレビューは混ぜない。親子ASIN等の共有範囲は取得状況に明記。

recipe_reviews はレシピ/EC/商品番号/外部レビューIDで一意。更新レビューをupsert。収集結果と分析予約はRPCで同時保存。レビューなしと未取得は別状態。既存値は未取得時に消さない。

分析は専用Skill analyze-aizu-reviews、gpt-6-astra/medium。保存済みレビューを各EC最新50件、本文800字/見出し300字までの固定スナップショットにし、対象件数・範囲・偏りを明記。全体とデータのある各ECの結果を保存。各指摘は同scopeの実在レビューID必須。原文一覧はDB保存全文、分析根拠は分析当時の抜粋。分析後の追加/更新は古い分析の警告を表示。

DB/APIは管理者・service_role限定、RLS有効、anon/authenticated直接アクセス不可。worker/task/status/leaseを検証。画面は15秒更新、原文30件/ページ、全体平均は全保存レビューの評価あり件数で加重（EC平均の単純平均にしない）。原文の個人プロフィールは取得しない。

Migration: scripts/apply-recipe-reviews-migration.cjs（既定rollback、--applyで本番反映）。
Tests: scripts/test-recipe-reviews.cjs、scripts/test-recipe-reviews-db.cjs（migration＋RPC重複/worker検証をrollback）、Bridge skill/monitor tests、型検査、lint、predeploy。
Bridge追加はversion 1.9.98の新capability recipeReviewsProtocol=1で分離。既存ジョブ契約は不変。インストーラーはinteractiveに収集、analysisに分析を配布。全体集約は当該レシピの全EC分であり、全レシピ横断ではない。
