// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** ← ここを自分の URL / ANON_KEY に置き換え */
const SUPABASE_URL  = 'https://zrerpexdsaxqztqqrwwv.supabase.co'
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…KNec'

const ALLOWED_EMAILS = ['aizubrandhall@gmail.com']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createMiddlewareClient({
    req,
    res,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ALLOWED_EMAILS.includes(user.email ?? '')) {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|login|unauthorized).*)'],
}
