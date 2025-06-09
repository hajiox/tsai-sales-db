import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { isAllowed } from "./lib/supabase"

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { cookie: req.headers.get("cookie")! } } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/login", req.url))
  if (!isAllowed(user.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL("/login", req.url))
  }
  return res
}

export const config = {
  matcher: ["/((?!api|login|_next|favicon.ico).*)"],
}
