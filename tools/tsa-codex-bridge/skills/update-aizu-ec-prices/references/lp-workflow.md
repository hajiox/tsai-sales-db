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
powershell -ExecutionPolicy Bypass -File scripts/find-lp-source.ps1 -LpUrl "<TSAで確認したURL>" -FreshClone
```

スクリプトはURLに紐づくVercelプロジェクトとGitHubリポジトリを照合し、`-FreshClone` で毎回 `C:\作業用\.lp-price-jobs` 内へ最新ソースを新規取得する。既存ローカルクローンは最新版判定にも編集にも使わない。単に同じURL文字列を含むTSAの移行ファイルをLP編集元と誤認しない。

TSA Bridgeの `TASK_JSON.lpSource` にサーバー許可済みの公開元がある場合は、次の2引数も渡す。VercelがGitHub連携情報を返さないプロジェクトだけ、この許可済み対応をフォールバックとして使う。スクリプトは新規クローン後にorigin、ブランチ、`HEAD == origin/<productionBranch>`、クリーン状態を再検証する。

```powershell
-ExpectedGithubRepository "<TASK_JSON.lpSource.githubRepository>" `
-ExpectedProductionBranch "<TASK_JSON.lpSource.productionBranch>"
```

スクリプトが複数候補を返したら、次を照合する。

- ソース内のドメイン
- ページタイトルと商品名
- Gitのremote URL
- `package.json` と既存のデプロイ設定

既知の検証済み対応:

- `https://wakeari.aizu-syokubura.com/` → `C:\作業用\wakeari`
- `https://cutchashu.aizu-syokubura.com/` → `C:\作業用\cutchashu`
- `https://chasieu.aizu-syokubura.com/` → `C:\作業用\chasiu`

この対応もTSAと現行リポジトリで再確認する。

## 編集

1. `git status -sb` と差分を確認する。
2. `git fetch origin` 後に、現在の `HEAD` がVercelの本番ブランチ `origin/<productionBranch>` と一致することを確認する。一致しなければ編集前に停止する。
3. URL、商品名、旧価格を `rg` で検索する。`node_modules`、`.next`、`.git`、`dist`、`build`、`out` は除外する。
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

## Git安全策

- 無関係なユーザー変更をステージしない。
- 汚れた作業ツリーで対象ファイルに重複変更がある場合は、勝手に上書きせずユーザーへ確認する。
- `git reset --hard` や `git checkout --` を使わない。
- remote、ブランチ、デプロイ先を推測で新規作成しない。既存構成を確認する。
