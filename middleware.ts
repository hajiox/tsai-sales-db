// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_EMAILS = ['aizubrandhall@gmail.com']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // ▶ 環境変数を Edge へ明示的に渡す
  const supabase = createMiddlewareClient({
    req,
    res,
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_ANON_KEY!,
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ALLOWED_EMAILS.includes(user.email ?? '')) {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }
  return res
}

/* /login と /unauthorized は保護対象にしない */
export const config = {
  matcher: [
    '/((?!_next/|favicon.ico|login|unauthorized).*)',
  ],
}
