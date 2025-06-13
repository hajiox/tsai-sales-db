import { withAuth } from "next-auth/middleware"

export default withAuth({
  secret: process.env.NEXTAUTH_SECRET ?? "next-auth-secret",
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ token }) => !!token,
  },
})

export const config = {
  matcher: ["/", "/((?!_next/|favicon.ico|login).*)"],
}
