# 自社LP価格改定

## 正となるリンク集

TSAレシピから `product_lp_url`、Bridgeから `TASK_JSON.lpUrl` が渡された場合は、その登録済みURLを正として使用する。LP単独工程で必須URLが欠けている場合は、その欠落を返し、ブラウザーで候補を探さない。URLが渡されない別の手動調査でだけ、ログイン済みChromeで次を開く。

`https://v0-tsa-19.vercel.app/links`

「自社リンク集」から商品名、説明、URLを照合する。TSAに登録されたリンクが対象LPの正であり、過去の会話や静的なメモだけでLPを選ばない。

TSAのタイトルや説明は古い場合がある。リンク先で現在の容量・商品形態を確認する。

## LP単独工程の価格根拠

`TASK_JSON.lpUpdate=true` かつ `TASK_JSON.targets=[]` は、ECと独立してLPだけを確認・反映する正規の工程である。EC対象、`siteBaselines`、`recoveryPlanSites` が空であることだけを理由に停止しない。対象ECを追加したり、完了済みECを再巡回・再変更したりしない。

LP単独工程の計画と公開確認はデータ取得であり、ログイン済みECのUI操作はない。正確な `TASK_JSON.lpUrl` を直接HTTPS GETし、`Cache-Control: no-cache` と `Pragma: no-cache` 等でキャッシュを避ける。HTTP応答と取得HTMLのうち、対象商品の名前・販売単位・価格が対応する箇所だけを確認する。ソースの取得・検証には指定ヘルパーと既存のGit/Vercel/GitHub CLIを使う。

Bridgeは計画前に `scripts/read-lp-public-page.cjs` を実行し、`TASK_JSON.lpPublicEvidence` にHTTP状態・最終URL・本文と商品ブロックの小さなJSONを渡す。これを公開証拠として使い、追加取得または公開後の再確認だけ次を実行する。`lpPublicReaderPath` がない手動作業では、このジョブが読んだSkillの絶対パスから同じヘルパーを組み立てる。

```powershell
node '<TASK_JSON.lpPublicReaderPathの絶対パス>' --url '<TASK_JSON.lpUrl>'
```

ヘルパーは厳密なUTF-8、サイズ・時間上限、no-cacheで読み、script/style/template/noscript・hidden/aria-hidden等の本文外データを除外する。`main`を優先して本文と商品ブロックを返すが、CSS/JavaScriptを実行した画面そのものではない。生HTMLやPowerShell既定のHTMLパーサーを追加利用せず、HTTP200の中のスクリプト用404断片をページ全体の404と誤認しない。実HTTPエラーや表示本文の404、欠けた対象商品、曖昧な販売単位は停止理由としてそのまま返す。

各変更箇所の `occurrence_evidence` には、提供された対象商品ブロックの正確な `block_id` を必ず1個だけ含め、商品名・販売単位・現価格の対応を書く。対象外や別商品のIDを同欄へ列挙せず、除外の説明とIDは `lp.product_evidence` に書く。ブロック内の可視価格が複数基準なら推測で1つを選ばない。`block_id` は価格だけを除いた商品ブロック本文の識別値であり、公開後も同じ商品・販売単位のブロックで計画の目標価格を確認する。別カードに同額があるだけでは完了にできない。出力が切り詰められ対象証拠が欠けた場合は `--match '<公開商品名の正確な一部>'` で絞るか、曖昧として停止する。計画前の `lpPublicEvidence` をデプロイ後の確認へ使い回さない。

このLP単独工程ではブラウザーツールを一切呼ばない。`cua_repl` の状態取得、`getBrowser`、既存タブ取得・遷移、新規タブ作成、Chrome DevTools MCPも対象外であり、許可される新規タブ数は0枚である。登録済みURLの直接取得で対象商品と価格を証明できなければ、HTTPエラー、必要表示がHTMLにない、商品と価格の対応が曖昧など、観測した理由を返す。別URL・別商品を代用せず、ソース内の価格だけで公開確認済みとしない。EC画面を操作する工程のChrome優先順・認証ゲートはそのまま適用する。

- 公開LPとFresh Cloneで対象商品を照合し、容量・販売個数・形態・保存方法がTSAレシピの販売単位と一致し、対象表示が標準の税込価格であることを現行LPと固定入力から証明する。同一販売単位の標準価格箇所には、既存schemaの `pricing_basis="standard_price"` を使い、`target_price=TASK_JSON.newPriceInclTax` とする。これは固定済み税込目標価格を直接指定する根拠で、対象ECの指定を必要としない。
- LP単独計画は `sites=[]`、`reference_standard_price=null` を返す。旧標準価格やECの保存値は、この標準価格のLP計画には不要である。LPの現価格は `observed_price` に記録し、旧LP価格をキャンペーンの標準基準価格に流用しない。
- 各対象箇所のソースファイル、商品との対応、現価格、目標価格を証明できたら通常どおり `lp.status="planned"` とする。対象箇所がすべて計画できれば全体 `status="ready"` にできる。ECが空であることと、商品・公開元・変更箇所が未確認であることを混同しない。
- 販売個数・容量の異なるセット、送料条件や商品単価の対応が未確認の送料別表示、比較価格など別基準の価格には、この標準価格を適用しない。送料別という表示だけで商品単価を別基準と決めつけず、下記の検証済み事実に一致する商品単価は標準価格として扱う。固定入力または検証済み根拠からその箇所の正確な目標価格を証明できなければLP工程をブロックする。EC名、基準価格、倍率、送料差額を推測せず、`sites` や `targets` を補充しない。

### 検証済みの単品・送料別表示（2026-10-12）

- IE-K【S】1食、JAN `4571318633816`。常温・麺1食＋スープ1食＋豚バラチャーシュー2枚。登録LP `https://ie-k.aizubrandhall-lp2.com/` の「チャーシュー2枚付き」単品カードが対応する。
- 公式楽天商品 `https://item.rakuten.co.jp/aizubrandhall/10000141/` の本文とLPで、「2個まで全国一律300円」の別建て送料、同じ単品構成・保存方法が一致することを確認済み。TSAの同じ価格改定の検証済み楽天結果も、この単品の税込商品価格を標準価格としている。
- この商品のLPは税込**商品単価**に固定入力 `newPriceInclTax` を使う。送料300円や送料込総額を新価格へ置換せず、BASEの差額計算による別の目標価格も流用しない。実行時のJAN、単品構成、保存方法、LPと送料条件が上記と違う場合はこの根拠を使わず停止する。
- 公開ヘルパーの `item_prices` と `shipping_prices` を区別する。複数の商品単価・不明な送料を推測で除外せず、対象商品ブロックの1つの単価だけを計画・公開確認する。

## 複数商品チャーシューLP

`https://chasieu.aizu-syokubura.com/` は、冷凍・レトルトを含む複数のチャーシュー商品を掲載する共通LPとして扱う。

- チャーシュー商品の価格改定では、専用LPの有無にかかわらず毎回このLPも確認する。
- 商品名、容量、冷凍・常温、カット済み・訳ありなどを照合し、対象商品のカードと同じ販売条件のCTA・構造化データだけを修正する。
- ページ内に同じ旧価格の商品が複数あっても、価格文字列を一括置換しない。
- 公開後は対象商品が新価格で、他商品が意図せず変わっていないことを確認する。

## ローカル編集元の発見

Bridgeの `TASK_JSON.lpResolvedSource` がある場合、当該ジョブで一度実行したresolverの唯一の新規cloneを、URL/host・GitHub origin・本番ブランチ・コミット・クリーン状態・realpath境界までBridgeが検証済みである。計画のカレントディレクトリはその実clone。相対パスで読み取り、`source_file` も相対パスで返す。resolverの再実行、別clone、UUID・絶対パスの再構築、過去ジョブのroot流用はしない。計画JSONでは `project_root=null`、`github_repository`・`production_branch`・`source_commit` は空文字とし、Bridgeが検証済みの4項目を束縛する。非空の矛盾値は自動補正されずブロックされる。計画中はcloneを変更しない。書込工程は同じ束縛済みrootを使い、以下のGit更新確認・変更箇所確認を維持する。

Windowsの明示 `workspace-write` 工程は、`--ignore-user-config` で欠落する既存のsandbox実装 `windows.sandbox="elevated"` をBridgeがper-runで固定し、作業範囲・自動レビュー・承認制約を維持する。実際の権限エラーや承認待ちは回避せず停止する。

以下の手動resolver手順は `lpResolvedSource` がない工程だけで使用する。

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
6. TSAレシピに登録された商品LP URLをキャッシュを避けた直接HTTPS取得で読み、新価格と商品内容を確認する。LP単独工程では公開確認用のブラウザーやタブを作成しない。Vercelの一時URLだけの確認では完了にしない。

公開URLで旧価格が残る場合は、デプロイ完了、CDN反映、別価格箇所の順に調べる。ローカル変更やpushだけで完了扱いしない。

push・本番デプロイの直前に再度fetchし、本番ブランチが編集開始時から進んでいたら古い変更を公開しない。意図した再baseまたは新規cloneで差分を再検証してから進める。

## Git安全策

- 無関係なユーザー変更をステージしない。
- 汚れた作業ツリーで対象ファイルに重複変更がある場合は、勝手に上書きせずユーザーへ確認する。
- `git reset --hard` や `git checkout --` を使わない。
- remote、ブランチ、デプロイ先を推測で新規作成しない。既存構成を確認する。

2026-10-11: Skillの絶対パスからヘルパーを実行する手順へ修正。Fresh Cloneの不要なrg依存と本番ブランチ推測を除去し、限定検索・CLI認証失敗・origin/branch/HEAD/clean検証をローカルfixtureで確認。実EC/LPの価格変更は検証で実行しない。

2026-10-11: LP単独工程の同一販売単位・標準価格は、既存の `standard_price` 根拠で固定済み税込目標価格を使うと明記。schemaと検証処理が `sites=[]`・`reference_standard_price=null` を許容することを確認。別販売単位・別価格基準の推測禁止は維持。

2026-10-11: LP単独工程の公開情報取得と検証を登録済みURLへの直接HTTPS・no-cacheへ統一し、ブラウザーツールとタブを使わないことを明記。ECのChrome操作手順は維持。
2026-10-11: PS5既定HTMLパーサーとNext.jsの非表示404断片による誤停止を避け、決定的UTF-8公開読取ヘルパーと価格以外の商品ブロック識別値を導入。計画前・公開後に同じ対象商品を照合し、生HTML全体の価格一致を完了根拠にしない。
