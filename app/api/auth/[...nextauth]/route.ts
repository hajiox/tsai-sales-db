// app/api/auth/[...nextauth]/route.ts (修正後)

import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import jwt from "jsonwebtoken"; // <- 追加

// ログインを許可するメールアドレス
const ALLOWED_EMAIL = "aizubrandhall@gmail.com";

// ステップ1で設定した環境変数を取得
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
if (!SUPABASE_JWT_SECRET) {
  // .env.localまたはVercelの環境変数に設定されていない場合、エラーを発生させる
  throw new Error("SUPABASE_JWT_SECRET is not set in environment variables");
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: {
    // セッション管理にJWTを使用する設定
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      // 許可されたメールアドレスか確認
      return user.email?.toLowerCase() === ALLOWED_EMAIL;
    },

    // --- ここからが重要な変更点 ---
    async jwt({ token, user }) {
      // ログイン直後（userオブジェクトが存在する）の場合に実行
      if (user && user.email?.toLowerCase() === ALLOWED_EMAIL) {
        const payload = {
          email: user.email,
          role: "authenticated",
          // ★トークンの有効期限を30日に設定 (60秒 * 60分 * 24時間 * 30日)
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        };
        // Supabaseの秘密鍵で署名した新しいトークンを生成
        token.supabaseAccessToken = jwt.sign(payload, SUPABASE_JWT_SECRET);
      }
      return token;
    },
    async session({ session, token }) {
      // クライアント側で使うセッション情報に、Supabaseのアクセストークンを追加
      if (token.supabaseAccessToken) {
        (session as any).supabaseAccessToken = token.supabaseAccessToken;
      }
      return session;
    },
    // --- ここまでが重要な変更点 ---
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
