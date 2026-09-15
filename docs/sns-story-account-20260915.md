# 2026-09-15 Instagram / IGストーリーのアカウント名

- Instagramで先行反映済みの `satou.masahiko` → `aizubrand_ec` をIGストーリーにも適用。`aizubrandhall` とX・Threadsの候補は保持。
- UI/APIの共通許可リスト、Bridge 1.9.91、同梱およびインストール済み投稿Skillを一致させた。保存済み投稿履歴・固定済みジョブの宛先は書き換えない。
- 全9組の投稿先、旧名拒否、別アカウントの成功結果拒否、固定値改変拒否、Bridge Skill契約を検証。Skill Creator検証、node構文検証、security/RLSも通過。
- 稼働PCではバックアップ後にメンテナンスロックでSNS workerの待機を確認し、Bridge/Skillを更新。既存監督プロセスで再起動する。実投稿は検証として実行しない。
- 共有同期は既存の未コミット変更により停止。共有repoには当該SNS Skillが存在しないため、TSAアプリの同梱Skillとローカルの配布先だけを更新した。
