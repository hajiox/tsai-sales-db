# TSA Recipe SNS Note

## 2026-08-25

- レシピ詳細を「レシピ」「EC情報」「SNS」の3タブへ分割。タブ切替時も未保存編集とEC内のBridge進捗を保持し、印刷レイアウトは従来どおりレシピ内容を使用する。
- SNSタブでX（16:9・400文字）、Instagram（1:1・2,200文字・ハッシュタグ10〜15件）、IGストーリー（9:16・50文字）、Threads（4:3・500文字）を一括生成する。
- 画像元はポートレート画像をランダム優先し、未登録時だけWeb商品画像の先頭を使用。Sharpで媒体別WebPを作り、入力画像とは別のVercel Blob領域と`recipe_sns_generations`へ保存する。
- 投稿文はBridge 1.8.39、GPT-5.6 Sol / medium、専用`generate-aizu-sns-posts` Skillで生成。保存済みEC情報と許可済み自社LP抜粋のみを渡し、Web検索、巨大Chat参照、外部投稿・更新を禁止する。
- 生成履歴は不変の版として保存し、画面から再表示・再生成・投稿文編集・コピー・画像保存ができる。未保存のEC情報がある間は生成を開始しない。

### Verification

- `npm run test:recipe-sns-feature`: success
- `npm run test:recipe-sns-bridge`: success
- `npm run test:recipe-sns-migration`: 23 checks passed and rolled back
- `npm run apply:recipe-sns-migration`: 23 post-apply checks passed
- Sharp crop smoke test: success
- `npm run build`: success
- Security secret scan and RLS check: success
- Codex structured outputで未対応の`uniqueItems`を除去し、同じ問題を検出するBridgeテストを追加。
- 再生成時は、過去に選択していた版ではなく実行中ジョブの新しい版へ自動で切り替わることを回帰テストで固定。
- 本番`v0-tsa-19.vercel.app`で「酒塩アウトドアMIX」を生成し、4媒体の投稿文、文字数・ハッシュタグ制限、1600x900 / 1080x1080 / 1080x1920 / 1200x900画像、履歴保存を確認。
- Bridge 1.8.39を事務所PCへ再インストールし、専用Skill配置とheartbeatを確認。

### Remaining

- 本機能は投稿素材の生成・編集・コピーまで。各SNSへの自動投稿や予約投稿は行わない。
