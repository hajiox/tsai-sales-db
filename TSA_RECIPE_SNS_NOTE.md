# TSA Recipe SNS Note

## 2026-08-26

- SNS画像生成をBridge 1.8.43 / protocol 2へ更新し、`通常リサイズ`、`クリエイティブ`、`アレンジ`の3モードを実装した。旧「画像だけ切り直す」は画面から廃止した。
- 2026-08-26: ImageGenの公式Skill読取を禁止コマンドと誤判定する本番障害を修正。許可対象は固定されたローカル `imagegen/SKILL.md` の読取だけで、外部操作・任意コマンド・巨大Chat参照の禁止は維持する。
- 全モードとも新規・非再開の`codex exec`を使い、専用`generate-aizu-sns-assets` Skill、固定済み商品スナップショット、選択元画像1枚だけを入力する。巨大な過去Chat、Web検索、ブラウザ操作、外部投稿は読み込み・実行しない。
- `通常リサイズ`はImageGenを使わず元画像をX 16:9、Instagram 1:1、IGストーリー 9:16、Threads 4:3へ確定変換する。`クリエイティブ`はImageGenで広告向け背景を作り、Solが根拠内で作った日本語見出しをWindows側で正確に描画する。`アレンジ`は元商品を参照し、生活の中に自然に置いた媒体別画像をImageGenで作る。
- Bridgeは生成画像をジョブ専用artifactとしてTSAへ送り、TSAがジョブ・媒体・形式・サイズを再検証してからVercel Blobの不変履歴へ公開する。ローカル生成パスはDBへ保存しない。
- 実行中は30秒ごとに経過時間と生成工程を更新し、正当な長時間ImageGen処理を2分停止エラーにしない。

### Verification

- `npm run test:recipe-sns-feature`: success
- `npm run test:recipe-sns-image-layout`: 12 checks passed
- `npm run test:recipe-sns-creative-renderer`: Japanese overlay and 1080x1920 output verified
- `npm run test:recipe-sns-bridge`: success
- Changed-file ESLint: success
- PowerShell creative renderer smoke: 1080x1080 JPEG and Japanese overlay verified
- `NEXTAUTH_URL=https://v0-tsa-19.vercel.app npm run build`: success

## 2026-08-25

- レシピ詳細を「レシピ」「EC情報」「SNS」の3タブへ分割。タブ切替時も未保存編集とEC内のBridge進捗を保持し、印刷レイアウトは従来どおりレシピ内容を使用する。
- SNSタブでX（16:9・400文字）、Instagram（1:1・2,200文字・ハッシュタグ10〜15件）、IGストーリー（9:16・50文字）、Threads（4:3・500文字）を一括生成する。
- 画像元はポートレート画像をランダム優先し、未登録時だけWeb商品画像の先頭を使用。Sharpで媒体別WebPを作り、入力画像とは別のVercel Blob領域と`recipe_sns_generations`へ保存する。
- 投稿文はBridge、GPT-5.6 Sol / medium、専用SNS素材Skillで生成。保存済みEC情報と許可済み自社LP抜粋のみを渡し、Web検索、巨大Chat参照、外部投稿・更新を禁止する。
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
