import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

type UserInfo = { id: string; email: string }

const authorize = ({ email }: { email?: string }): UserInfo | null => {
  if (!email) return null
  const normalized = email.toLowerCase()
  if (normalized !== "aizubrandhall@gmail.com") return null
  return { id: normalized, email: normalized }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? "next-auth-secret",
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "GOOGLE_CLIENT_ID",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "GOOGLE_CLIENT_SECRET",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return !!authorize({ email: user.email })
    },
    async session({ session }) {
      if (session.user) {
        (session as any).role = authorize({ email: session.user.email }) ? "admin" : "user";
      }
      return session;
    },
    async jwt({ token }) {
      if (token.email) {
        (token as any).role = authorize({ email: token.email }) ? "admin" : "user";
      }
      return token;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
