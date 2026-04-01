---
description: 全プロジェクト共通の開発履歴MDファイル管理ルール。開発開始時にローカルとGoogle Driveの両方を確認する。MDはGitHubにプッシュしない。
---

# 開発履歴MD管理ワークフロー（全プロジェクト共通）

## 最重要ルール

### 1. 開発MDはGitHubにプッシュしない

全プロジェクトの開発履歴MDは `.gitignore` で除外し、Gitで追跡しない。
管理はGoogle Driveで行う。

### 2. 開発セッション開始時に必ず確認すること

1. **ローカルMDを読む** — 対象プロジェクトの開発MDを `view_file` で確認
2. **Google DriveのMDを確認する** — Drive上の同名ファイルの内容を確認
3. **差分があればDrive側を正とする** — Drive側が新しければローカルに反映

### 3. 作業完了後はDriveにアップロード

ローカルMDを更新したら必ずDriveにも反映する。

---

## プロジェクト別 開発MDファイル一覧

| プロジェクト | ファイル名 | パス |
|---|---|---|
| **TSA（全体）** | `全体開発.md` | `c:\作業用\tsai-sales-db\全体開発.md` |
| **TSA（全体）** | `全体開発.md` | `c:\作業用\全体開発.md`（ルート） |
| **TSA（レシピ）** | `TSA開発.md` | `c:\作業用\tsai-sales-db\TSA開発.md` |
| **DocScanner** | `書類スキャンAI管理システム.md` | `c:\作業用\doc-scanner\書類スキャンAI管理システム.md` |
| **DisGrav** | `DisGrav開発.md` | `c:\作業用\disgrav\DisGrav開発.md` |
| **OEM/B2B** | `OEM開発.md` | `c:\作業用\oem_btob\OEM開発.md` |
| **Excel解析くん** | `Excel解析.md` | `c:\作業用\excel-analyzer\Excel解析.md` |
| **AIバナー** | `プロジェクト総括.md` | `c:\作業用\ai-banner-generator\プロジェクト総括.md` |
| **Shopee** | `Shopee.md` | `c:\作業用\shopee-chatbot\Shopee.md` |
| **ヤマト出荷** | `ヤマト出荷データ管理システム.md` | `c:\作業用\yamato-analytics\ヤマト出荷データ管理システム.md` |

---

## Google Drive情報

- **フォルダURL**: https://drive.google.com/drive/folders/1jIEslY2H9Z9jyvPaKMFhCmoCNd7dDwU9
- **Googleアカウント**: aizubrandhall
- **サービスアカウント（API用）**: `billing-viewer@tsai-460605.iam.gserviceaccount.com`
  - ※ 上記フォルダに「編集者」として共有が必要

## API（tsai-sales-db経由）

- `GET /api/recipe/dev-docs` — ファイル一覧
- `GET /api/recipe/dev-docs?file=全体開発.md` — 内容取得
- `POST /api/recipe/dev-docs` — アップロード `{ fileName, content }`
