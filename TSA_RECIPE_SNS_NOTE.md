# TSA Recipe SNS Note

## 2026-09-02

### 投稿文の3口調と履歴折りたたみ

- SNS素材生成へ`オフィシャル`、`スタッフ`、`開発者`の3口調を追加した。選択値は生成履歴の不変`source_snapshot`、Bridgeジョブ、最小入力packet、構造化出力へ同じ`writingTone`として固定し、TSA側で不一致を拒否する。
- `オフィシャル`は落ち着いたマーケッター視点、`スタッフ`は世間話と控えめなユーモアを含む明るく長めの文章、`開発者`は一人称「俺」で商品ポイントとこだわりを掘り下げる。入力にない実体験、試作回数、客の反応、比較優位を創作しない境界を専用Skillへ追加した。
- 口調を変更した状態では1媒体だけの再生成を無効にし、1つの生成版へ複数人格が混ざらないようにした。同じ口調なら従来どおり個別再生成できる。旧履歴は後方互換として`オフィシャル`表示になる。
- 投稿・予約履歴は件数を表示したまま初期状態を閉じ、必要な時だけ展開する。
- Bridgeを1.9.53、Skill contractを`2026-09-02.1`へ更新した。巨大な過去Chat、過去task、Web検索、外部投稿を素材生成へ渡さない既存境界は維持する。

#### Verification

- `test:recipe-sns-feature`、`test:recipe-sns-bridge`、`test:recipe-sns-target-merge`、`test:recipe-sns-publication`: success
- `test:bridge-skill-contract`、`test:bridge-run-guard`: success
- 変更対象ESLint、Bridge構文確認、2つのSkill `quick_validate.py`: success
- Secret scan、Supabase RLS audit、本番環境変数を使った`next build`: success
- 全体`tsc --noEmit`は既存の未解消エラーで失敗したが、今回変更ファイルのエラーは0件。

## 2026-08-31

### SNS素材生成Bridgeの復旧

- SNS素材生成がキューのままモニターへ出ない障害を調査した。`recipe_sns_generate`の要求はprotocol 3だが、後続マイグレーションが`claim_web_sales_codex_job`の古いprotocol 1定義を復元しており、protocol 3を通知するBridgeが取得不能になっていた。
- protocol 1または2だけをprotocol 3へ修復する冪等マイグレーションを追加した。SNS投稿、EC商品情報など他タスクの取得ガードが残ることも同時検証し、SNS投稿マイグレーション側のテストをprotocol 3の完全一致確認へ強化した。
- 対話BridgeのPowerShell監督プロセスが外部終了コード`0xC000013A`で消え、ログオン時トリガーだけでは復帰しなかった。ログオン時起動に加え、1分間隔の存在確認トリガーを登録し、`MultipleInstances IgnoreNew`で正常稼働中の重複起動を防ぐ構成へ変更した。
- 再開後、ImageGenが作った画像パスの読み取り専用列挙を一般コマンドと誤判定したため、`CODEX_HOME/generated_images`配下だけの限定`Get-ChildItem`を許可した。最終画像は同じ新規Codexセッションの生成フォルダまたは当該ジョブフォルダにあるものだけを受理し、外部閲覧、一般コマンド、画像内容のコマンド読取は禁止したままとした。
- 公式ImageGen Skillの読取は、`Get-Content`の`-Raw`と`-LiteralPath`の順序や省略形が変わっても、固定された同一`SKILL.md`だけを厳密に許可する。別ファイルの混在は拒否する。
- 生成画像の列挙は、許可ルート配下の`Get-ChildItem`、`File/Directory/Recurse`、更新時刻順、最大16件、`FullName/LastWriteTime`だけを許可する。拒否時は総称だけでなくコマンド名もモニター要約へ残す。
- Bridgeを1.9.30へ更新した。
- 2026-08-31: SNS投稿の初回再実行で、1つのCodexセッションが4媒体を担当していたためChrome初期化失敗が全媒体へ波及した。Bridge 1.9.32で1媒体＝1新規Codexセッションの逐次処理へ分離し、成功媒体を確定したまま失敗媒体を飛ばして次へ進む構成へ変更した。各セッションには現在インストール済みの公式Chrome制御Skillと`browser-client.mjs`の正しいパスを直接埋め込み、Playwright直接import、`globalThis`探索、CDPポート推測を禁止した。
- 2026-08-31: Bridge更新中に対話監視タスクの1分復旧トリガーが旧Bridgeを再起動し、安全停止確認と競合した。インストーラーで対話タスクを一時無効化してから停止し、成功・失敗いずれの場合も無効状態を残さないよう復旧処理を追加した。
- 2026-08-31: 媒体分離後の初回投稿で、Threadsの表示ボタンからfile chooserが3秒以内に開かず、未処理の待機失敗でブラウザー接続がリセットされた。投稿Skillと媒体資料へ、実在する`input[type=file]`の優先、10秒待機、失敗捕捉、最新画面確認、同一経路を反復しない基準を追加した。X・Instagramのモデル混雑と、開始確認用セッションによるMetaタブ占有はSkill変更対象外として分離した。
- 2026-08-31: Instagram Webにはストーリー作成入口がなかったが、ログイン済みMeta Business Suiteのストーリー作成画面で、Instagram `aizubrandhall`だけを投稿先に選び、1080x1920画像、画像上の固定文言、商品LPのリンクスタンプを保持した公開直前状態まで実機確認した。画面上部の「リンクを追加」はFacebookストーリー専用であり、Instagram用リンクは「編集」→「スタンプ」→「リンク」から設定する。本文とリンクは追加直後に安全領域へ移動し、作成画面プレビューで装飾が見えない場合は編集画面を1回だけ開き直して保持を確認する手順へ更新した。公開操作は未実施。

#### Verification

- SNS claim修復: 本番相当トランザクションdry-run、適用、再dry-runが全項目成功
- `npm run test:recipe-sns-publication-migration`: protocol 3を含む全20項目成功
- `npm run test:recipe-sns-bridge`: 限定パス列挙、別フォルダ混在拒否、同一セッション画像制約を確認
- `npm run test:bridge-prelogin`: PowerShell構文と1分間隔の回復トリガー契約を確認
- `npm run test:bridge-skill-contract`: 16 tasks / 15 dedicated Skills verified
- `npm run lint`: 0 errors（既存warningsのみ）
- 本番環境変数をプロセス注入した`next build`: success
- Secret scan / Supabase RLS audit: success
- 本番`v0-tsa-19.vercel.app`で、停止していた「チャーシュー訳あり800g」のアレンジ素材を第14版として再実行。ジョブ`9f5207e6-b6ef-481b-adbe-3bc45cc6a31b`が完了し、X 1600x900、Instagram 1080x1080、IGストーリー 1080x1920、Threads 1200x900の4画像と投稿文をVercel Blobへ保存した。
- LP URLはX・Instagram・Threads本文へ各1回、IGストーリーは本文外のリンクスタンプ用URLへ保存された。Bridgeモニターは取得直後から進捗、工程、見込み時間、Codex PIDを表示し、完了後は同ジョブの完了要約を保持した。

## 2026-08-30

### SNS自動投稿・予約

- 2026-08-31: 初回SNS投稿で、専用Skillの読取を任意コマンドと誤判定し、Codexが返した媒体別の停止理由を汎用エラーで上書きする不具合を修正した。許可対象はSNS投稿Skill、媒体別資料、現在のChrome制御Skillの読取だけに限定し、Web検索、任意ファイル、書込・外部コマンドは禁止を維持する。
- 2026-08-31: BridgeへSkill本文と媒体別資料をUTF-8で直接埋め込み、Shell読取と文字化けを不要にした。禁止操作や結果反映エラーが起きても、既に公開済み・未公開・操作待ちの媒体別実結果を保持し、完了済み媒体の重複再投稿を防ぐ。
- 2026-08-31: Chrome画像アップロードは公式手順どおりfile chooserを使い、ファイルURL権限不足時は媒体単位で停止理由を返して残りを続行する。ローカルHTTP上の無送信テストで、事務所PCの現行Chromeは画像選択可能であることを確認した。

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
