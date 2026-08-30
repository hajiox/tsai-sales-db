# TSA Recipe SNS Note

## 2026-08-30

### SNS自動投稿・予約

- SNS素材の確認画面へ、X、Instagram、IGストーリー、Threadsの個別投稿ボタンと、黒い「全SNSへ投稿」ボタンを追加した。即時投稿と日時予約を切り替え、予約取消、進捗、媒体別結果、公開URLを同じ画面で確認できる。
- 投稿先はX `@Aizu_Brand_Kan`、Instagram・IGストーリー・Threads `aizubrandhall` に固定し、投稿直前に画面上のアカウントを再確認する。本文、画像、リンク、投稿先、予約日時はボタン押下時の不変スナップショットとして保存する。
- `recipe_sns_publications` と3つの原子的RPCを追加し、二重クリックの直列化、実行中の同一SNS再登録防止、同一依頼の再利用、実行開始後の取消防止、Bridge結果と投稿履歴の同時確定を実装した。外部投稿は自動再試行せず、1媒体で停止しても残りを続行する。
- Bridge 1.9.27 / `recipe_sns_publish` / protocol 1を追加した。対話型事務所PCだけが取得でき、ログイン前Bridgeは取得しない。予約時刻にPC・Chromeを利用できない場合はキューで待機し、利用可能になってから実行する。
- 専用`publish-aizu-sns-posts` Skillだけを新規・非再開の`codex exec`で使う。巨大な過去Chat、過去タスク、保存済みsession、Web検索、開発リポジトリを参照しない。固定クリック手順ではなく、確定値・禁止事項・最終証跡を固定し、現在の公式UIから正規経路を選ぶ。
- IGストーリーのLP URLは投稿文ではなくリンクスタンプへ設定する。通常Instagram Webに作成経路がない場合だけ、既にログイン済みの公式Meta Business Suiteを利用し、使えない場合はIGストーリーだけを操作待ちとして他媒体を続行する。

#### Verification

- `npm run test:recipe-sns-publication`: success
- `npm run test:bridge-skill-contract`: 16 tasks / 15 dedicated Skills verified
- `npm run test:bridge-prelogin`: success; `recipe_sns_publish` is interactive-only
- `npm run test:bridge-run-guard`: success; bounded 75-minute multi-platform window
- SNS投稿マイグレーション: 20 checks passed in dry-run and post-apply verification
- 新規Skill `quick_validate.py`: valid
- Changed-file ESLint: success
- 本番環境変数をプロセス注入した `next build`: success
- Secret scan / Supabase RLS audit: success

### LP遷移先

- レシピに商品LP URLが設定されている場合、X・Instagram・Threadsの投稿文へ同じ遷移先URLを必ず1回入れるようにした。
- 専用SkillとBridgeの生成指示へURL必須条件を追加し、TSA側でも生成結果の保存時・履歴表示時・コピー時に欠落・重複・媒体別配置を補正する。個別再生成で他媒体の文面を引き継ぐ場合も同じ保証を適用する。
- 本文URLを使う3媒体ではURLを優先し、文字数上限を超える場合は本文側を短縮する。設定URLが不正な場合は外部処理を開始せず、EC情報の修正を案内する。
- IGストーリーは本文URLでは遷移できないため、本文からURLを除外し、Bridgeの構造化出力と画面の「リンクスタンプ用URL」へ分離した。X・Instagram・Threadsは本文URLを維持し、過去履歴も表示時に新ルールへ補正する。

### Verification

- `npm run test:recipe-sns-target-merge`: URL必須・重複除去・文字数上限を確認
- `npm run test:recipe-sns-feature`: success
- `npm run test:recipe-sns-bridge`: success
- Bridge Schema: 全投稿の`link_url`契約とIGストーリー専用割当を確認
- Changed-file ESLint: success
- `NEXTAUTH_URL=https://v0-tsa-19.vercel.app npm run build`: compile success; page-data収集はローカルにSupabase環境変数がないため既存APIで停止

## 2026-08-26

- SNS画像生成をBridge 1.8.44 / protocol 2へ更新し、`通常リサイズ`、`クリエイティブ`、`アレンジ`の3モードを実装した。旧「画像だけ切り直す」は画面から廃止した。
- 2026-08-26: ImageGenの公式Skill読取を禁止コマンドと誤判定する本番障害を修正。CodexイベントのWindowsパス二重表記を照合前に正規化し、許可対象は固定されたローカル `imagegen/SKILL.md` の読取だけとした。外部操作・任意コマンド・巨大Chat参照の禁止は維持する。
- 全モードとも新規・非再開の`codex exec`を使い、専用`generate-aizu-sns-assets` Skill、固定済み商品スナップショット、選択元画像1枚だけを入力する。巨大な過去Chat、Web検索、ブラウザ操作、外部投稿は読み込み・実行しない。
- `通常リサイズ`はImageGenを使わず元画像をX 16:9、Instagram 1:1、IGストーリー 9:16、Threads 4:3へ確定変換する。`クリエイティブ`はImageGenで広告向け背景を作り、Solが根拠内で作った日本語見出しをWindows側で正確に描画する。`アレンジ`は元商品を参照し、生活の中に自然に置いた媒体別画像をImageGenで作る。
- Bridgeは生成画像をジョブ専用artifactとしてTSAへ送り、TSAがジョブ・媒体・形式・サイズを再検証してからVercel Blobの不変履歴へ公開する。ローカル生成パスはDBへ保存しない。
- 本番 `v0-tsa-19.vercel.app` で通常リサイズ第3版、クリエイティブ第6版、アレンジ第7版の完走を確認した。各AIモードともX 1600x900、Instagram 1080x1080、IGストーリー 1080x1920、Threads 1200x900のWebPを保存し、クリエイティブの日本語描画とアレンジの生活シーンを目視確認した。
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
