---
description: Vercelへのデプロイ手順（tsai-sales-db → tsa プロジェクト）
---

# Vercelデプロイ ワークフロー

## 重要な注意事項

> ⚠️ **絶対に `vercel login` を実行した直後に `--yes` フラグ付きでデプロイしないこと**
> 
> `vercel login` は `.vercel` フォルダを再作成する場合があり、`--yes` フラグは
> 新しいプロジェクトを自動作成してしまう。これにより環境変数が全て失われる事故が発生する。

## プロジェクト情報

- **Vercelプロジェクト名**: `tsa`
- **Vercelプロジェクト ID**: `prj_ISYZowGOKUCAxHVQe43Qq6dAZKy2`
- **Vercel org ID**: `team_ALWgHRWgR0j19g8MvpcuYX3N`
- **GitHub リポジトリ**: `https://github.com/hajiox/tsai-sales-db.git`
- **本番URL**: `https://v0-tsa-19.vercel.app`

## デプロイ手順

// turbo-all

1. `.vercel/project.json` の内容を確認する
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content "c:\作業用\tsai-sales-db\.vercel\project.json" -Encoding UTF8
```
**期待される内容**: `"projectId":"prj_ISYZowGOKUCAxHVQe43Qq6dAZKy2"` かつ `"projectName":"tsa"`
もしprojectIdが異なる場合は、上記の正しいIDに修正してからデプロイすること。

2. ローカルビルドを確認する
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; npx next build 2>&1 | Select-Object -Last 10
```

3. git commit & push する
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; git -C "c:\作業用\tsai-sales-db" add -A; git -C "c:\作業用\tsai-sales-db" commit -m "変更内容をここに記述" 2>&1
```

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; git -C "c:\作業用\tsai-sales-db" push origin main 2>&1
```

4. Vercelにデプロイする
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; npx vercel --prod --yes 2>&1
```

5. デプロイ結果を確認する（出力に `tsa` が含まれていることを確認）

## トークン期限切れの場合

もし `The specified token is not valid` エラーが出た場合：

1. `vercel login` を実行する
2. **ログイン後、必ず `.vercel/project.json` の内容を確認する**
3. projectId が `prj_ISYZowGOKUCAxHVQe43Qq6dAZKy2` であることを確認してからデプロイ
