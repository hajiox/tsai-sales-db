---
description: SupabaseのDBに対してSQLマイグレーションを実行する
---

# DB マイグレーション ワークフロー

## 前提条件
- psql がインストール済み（`C:\Program Files\PostgreSQL\17\bin\psql.exe`）
- `.env.local` に `DATABASE_URL` が設定済み

## 接続情報
- **Host**: aws-0-ap-southeast-1.pooler.supabase.com
- **Port**: 6543
- **User**: postgres.zrerpexdsaxqztqqrwwv
- **Database**: postgres
- **Password**: .env.local の DATABASE_URL から取得

## 実行手順

### 1. PATHの確認
// turbo
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User"); psql --version
```

### 2. SQLの実行
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User"); $env:PGPASSWORD="WAmas0831"; $env:PAGER=""; psql -h aws-0-ap-southeast-1.pooler.supabase.com -p 6543 -U postgres.zrerpexdsaxqztqqrwwv -d postgres --no-psqlrc -P pager=off -c "<SQL文をここに入力>"
```

## 注意事項
- `$env:PAGER=""` を必ず設定する（`cat`コマンドがWindowsに存在しないためエラーになる）
- `--no-psqlrc` と `-P pager=off` を必ず付与する
- UTF-8エンコーディングを確保するため、`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` を必ず先頭に付ける

## よく使うSQLテンプレート

### カラム追加
```sql
ALTER TABLE <テーブル名> ADD COLUMN IF NOT EXISTS <カラム名> <型> DEFAULT <デフォルト値>;
```

### テーブル構造確認
```sql
SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = '<テーブル名>' ORDER BY ordinal_position;
```

### データ確認
```sql
SELECT * FROM <テーブル名> LIMIT 5;
```
