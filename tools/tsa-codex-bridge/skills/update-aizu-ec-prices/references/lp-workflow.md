# 自社LP価格改定

## 正となるリンク集

TSAレシピから `product_lp_url` が渡された場合は、そのURLを正として使用する。URLが渡されず手動調査するときだけ、ログイン済みChromeで次を開く。

`https://v0-tsa-19.vercel.app/links`

「自社リンク集」から商品名、説明、URLを照合する。TSAに登録されたリンクが対象LPの正であり、過去の会話や静的なメモだけでLPを選ばない。

TSAのタイトルや説明は古い場合がある。リンク先で現在の容量・商品形態を確認する。

## 複数商品チャーシューLP

`https://chasieu.aizu-syokubura.com/` は、冷凍・レトルトを含む複数のチャーシュー商品を掲載する共通LPとして扱う。

- チャーシュー商品の価格改定では、専用LPの有無にかかわらず毎回このLPも確認する。
- 商品名、容量、冷凍・常温、カット済み・訳ありなどを照合し、対象商品のカードと同じ販売条件のCTA・構造化データだけを修正する。
- ページ内に同じ旧価格の商品が複数あっても、価格文字列を一括置換しない。
- 公開後は対象商品が新価格で、他商品が意図せず変わっていないことを確認する。

## ローカル編集元の発見

既定の作業ルートは `C:\作業用`。

```powershell
$skillDir = Split-Path -Parent '<このジョブが読み込んだSKILL.mdの絶対パス>'
$resolver = Join-Path $skillDir 'scripts/find-lp-source.ps1'
& $resolver -LpUrl '<TSAで確認したURL>' -FreshClone
```

`TASK_JSON.lpResolverPath` があれば `$resolver` はその固定済み絶対パスを使う。省略時の `$skillDir` はBridgeが今回読み込ませた本Skillの場所を使い、カレントディレクトリや過去ジョブのコピーから推測しない。`TASK_JSON.lpWorkspaceRoot` があれば同じ呼出しへ `-WorkspaceRoot '<その固定済み絶対パス>'` を必ず渡し、ジョブの書込許可範囲へ新規cloneを置く。既存のPowerShell実行ポリシーに従い、`ExecutionPolicy Bypass`、恒久的なポリシー変更、認証回避を加えない。実行できなければその具体的な制約を返す。

スクリプトは `-FreshClone` で毎回 `<WorkspaceRoot>/.lp-price-jobs`（既定は `C:\作業用\.lp-price-jobs`）内の一意な新規ディレクトリへ本番ブランチを取得する。この経路はローカル検索も `rg` も不要。既存ローカルクローンは最新版判定にも編集にも使わない。単に同じURL文字列を含むTSAの移行ファイルをLP編集元と誤認しない。

TSA Bridgeの `TASK_JSON.lpSource` にサーバー許可済みの公開元がある場合は、同じ呼出しに次の2引数も渡す。この固定入力を直接使用し、追加のVercelログインを要求しない。値をローカルパス、商品名、過去の会話から作らない。スクリプトは新規クローン後にorigin、チェックアウト中の本番ブランチ、`HEAD == origin/<productionBranch>`、クリーン状態を再検証する。

```powershell
-ExpectedGithubRepository "<TASK_JSON.lpSource.githubRepository>" `
-ExpectedProductionBranch "<TASK_JSON.lpSource.productionBranch>"
```

固定入力がない時は既存認証済みVercel CLIで登録済みURLのドメイン、唯一のプロジェクト、GitHub連携、本番ブランチを取得する。未インストールのCLIを自動導入せず、本番ブランチ未取得時に `main` を仮定しない。Vercel/GitHubのログイン、権限、アカウント確認に失敗した場合はLP工程を操作待ちにし、ローカルクローンや別リポジトリへ退避しない。

必要な場合だけ、既知リポジトリの読み取り証跡を `-SearchRoot '<WorkspaceRoot内の対象リポジトリまたはサブディレクトリ>'` で検索できる。`-FreshClone` なしの出力は編集許可にならず、ワークスペース全体を検索できない。`rg` がなければPowerShellで同じ限定ファイル群を検索する。依存・生成ディレクトリとリンクを除外し、深さ8、10000エントリ、1MB以下のソース/設定ファイルに制限する。上限に達したら対象を狭める。

新規クローンの編集前に、次を照合する。

- ソース内のドメイン
- ページタイトルと商品名
- Gitのremote URL
- `package.json` と既存のデプロイ設定

以下は旧ローカルクローンを調査するための証跡だけで、公開元の確定・編集・フォールバックには使用しない:

- `https://wakeari.aizu-syokubura.com/` → `C:\作業用\wakeari`
- `https://cutchashu.aizu-syokubura.com/` → `C:\作業用\cutchashu`
- `https://chasieu.aizu-syokubura.com/` → `C:\作業用\chasiu`

公開元は固定入力または現行Vercel連携で再確認する。

## 編集

1. `git status -sb` と差分を確認する。
2. `git fetch origin` 後に、現在の `HEAD` がVercelの本番ブランチ `origin/<productionBranch>` と一致することを確認する。一致しなければ編集前に停止する。
3. 新規クローン内の既知ソースディレクトリでURL、商品名、旧価格を `rg` で検索する。`rg` がなければ `git ls-files` で対象ソースを絞り、明示したファイルを `Select-String -SimpleMatch` で検索する。`node_modules`、`.next`、`.git`、`.vercel`、`dist`、`build`、`out` は除外する。
4. 表示価格だけでなく、JSON-LD、メタデータ、CTA内に同じ販売条件の価格がないか確認する。
5. `apply_patch` で対象箇所だけを変更する。
6. 同じ数字でも別商品、比較価格、レビュー文、送料説明なら変更しない。

## 検証と公開

1. `git diff --check` を実行する。
2. `package.json` の既存スクリプトに従い、通常は `npm run build` を実行する。
3. 意図したファイルだけをステージする。
4. リポジトリの既存運用が本番ブランチへのpushでVercel公開する構成なら、簡潔なコミットを作成して既存の本番ブランチへpushする。
5. GitHubのコミットステータスでVercel成功を確認する。別の既存デプロイ経路ならその手順を使う。
6. TSAレシピに登録された商品LP URLを直接読み、新価格と商品内容を確認する。Vercelの一時URLだけの確認では完了にしない。

公開URLで旧価格が残る場合は、デプロイ完了、CDN反映、別価格箇所の順に調べる。ローカル変更やpushだけで完了扱いしない。

push・本番デプロイの直前に再度fetchし、本番ブランチが編集開始時から進んでいたら古い変更を公開しない。意図した再baseまたは新規cloneで差分を再検証してから進める。

## Git安全策

- 無関係なユーザー変更をステージしない。
- 汚れた作業ツリーで対象ファイルに重複変更がある場合は、勝手に上書きせずユーザーへ確認する。
- `git reset --hard` や `git checkout --` を使わない。
- remote、ブランチ、デプロイ先を推測で新規作成しない。既存構成を確認する。

2026-10-11: Skillの絶対パスからヘルパーを実行する手順へ修正。Fresh Cloneの不要なrg依存と本番ブランチ推測を除去し、限定検索・CLI認証失敗・origin/branch/HEAD/clean検証をローカルfixtureで確認。実EC/LPの価格変更は検証で実行しない。
