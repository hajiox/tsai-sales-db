# TSA販売管理DBシステム（tsai-sales-db）開発ドキュメント

## 1. プロジェクト概要
本プロジェクトは、元々Vercel上でブラウザベースで開発されていた販売管理・KPI分析システムを、ローカル環境（`C:\Users\ts\OneDrive\Desktop\作業用\tsai-sales-db`）で開発・運用できるように環境構築を行ったものです。
DBはSupabase、AI分析にはGoogle Gemini API、認証にはNextAuth.js（Google認証）を使用しています。

## 2. ローカル環境構築履歴（2026/02/02実施）

### 2.1. 前提環境
*   OS: Windows
*   Node.js環境: `npm` 使用
*   作業ディレクトリ: `C:\Users\ts\OneDrive\Desktop\作業用\tsai-sales-db`

### 2.2. 依存関係のインストール
プロジェクトには依存関係の不整合があったため、以下のコマンドでインストールを実施しました。
```bash
npm install --legacy-peer-deps
```

### 2.3. ポート番号の変更（重要）
同一マシン内で稼働此ている別のチャットボットシステム（`shopee-chatbot`）がポート `3000` を使用していたため、本システムはポート **`3001`** を使用するように設定を変更しました。

**変更点:**
1.  **`package.json`**: `scripts` の `dev` コマンドを修正
    ```json
    "scripts": {
      "dev": "next dev -p 3001",
      // ...
    }
    ```
2.  **`.vscode/launch.json`**: デバッグ起動時のURLを `http://localhost:3001` に設定

### 2.4. 環境変数の設定 (`.env.local`)
ローカル開発用に `.env.local` ファイルを作成し、以下の変数を設定しました。
※セキュリティのため、実際の値は記載していません。開発時は `.env.local` を参照のこと。

| 変数名 | 説明 | 取得場所 |
| :--- | :--- | :--- |
| `DATABASE_URL` | Supabase DB接続文字列 | Vercel Project Settings / Supabase Settings |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Supabase Dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | Supabase Dashboard (Security注意) |
| `OPENAI_API_KEY` | OpenAI APIキー | (本プロジェクトではGeminiメインだが設定有) |
| `GEMINI_API_KEY` | Google Gemini APIキー | Google AI Studio / Vercel |
| **`SUPABASE_JWT_SECRET`** | JWT署名用シークレット | Supabase > Project Settings > API > **Legacy JWT Secret** または Custom Secret |
| **`GOOGLE_CLIENT_ID`** | Google OAuth Client ID | Google Cloud Console > APIs & Services > Credentials |
| **`GOOGLE_CLIENT_SECRET`** | Google OAuth Client Secret | 同上 |
| **`NEXTAUTH_URL`** | 認証後のリダイレクト先URL | **`http://localhost:3001`** (ポート3001を指定) |
| `NEXTAUTH_SECRET` | NextAuth用シークレット | 任意の文字列 |

### 2.5. Google OAuth認証の設定（Google Cloud Console）
ローカル環境（ポート3001）でのGoogleログインを有効にするため、以下の設定を行いました。

1.  **Google Cloud Console** にアクセス (`https://console.cloud.google.com/apis/credentials`)
2.  「APIとサービス」 > 「認証情報」 > 「OAuth 2.0 クライアント ID」 > 対象アプリ（TSA認証システム）を選択
3.  **「承認済みのリダイレクト URI」** に以下を追加して保存
    *   `http://localhost:3001/api/auth/callback/google`

これを行わないと、ログイン時に `Error 400: redirect_uri_mismatch` が発生します。

### 2.6. Next.js 15 (v16系) APIルート対応（2026/02/03追記）
Next.js 15 (v16系) の仕様変更により、APIルート（App Router）の `params` が非同期（Promise）に変更されました。
動的ルート（`app/api/links/[id]/route.ts` 等）で `params` を `await` せずに使用すると `invalid input syntax for type uuid: "undefined"` エラーが発生するため、以下の修正を行いました。

**修正内容:**
*   `PUT` および `DELETE` メソッドの引数定義を変更し、`params` を `await` して取得するように修正。

```typescript
// 修正前
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) { ... }

// 修正後
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  // ...
}
```

## 3. アプリケーションの起動方法
以下のコマンドで開発サーバーを起動します。
```bash
npm run dev
```
起動後、ブラウザで `http://localhost:3001` にアクセスします。

## 4. 特記事項・注意点
*   **データ同期**: ローカル環境の `.env.local` は本番環境と同じSupabaseプロジェクトを参照しています。そのため、**ローカルでのデータ操作（CRUD）は即座に本番データベースに反映されます**。テストデータの投入や削除には十分注意してください。
*   **VS Code設定**: `.vscode` フォルダ内に推奨拡張機能 (`extensions.json`) とデバッグ設定 (`launch.json`) を追加しました。VS Codeでの開発を推奨します。

---
*作成日: 2026/02/02 / 最終更新日: 2026/02/03*
