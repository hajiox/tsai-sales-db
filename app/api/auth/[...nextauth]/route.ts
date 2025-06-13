import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const allowedEmails = ["aizubrandhall@gmail.com"];

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "GOOGLE_CLIENT_ID",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "GOOGLE_CLIENT_SECRET",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return allowedEmails.includes((user.email ?? "").toLowerCase());
    },
    async session({ session, token }) {
      if (session.user) {
        (session as any).role = allowedEmails.includes((session.user.email ?? "").toLowerCase()) ? "admin" : "user";
      }
      return session;
    },
    async jwt({ token }) {
      if (token.email) {
        (token as any).role = allowedEmails.includes(token.email.toLowerCase()) ? "admin" : "user";
      }
      return token;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
