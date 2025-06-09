import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SUPABASE_URL  = process.env.SUPABASE_URL!
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY!
const ALLOWED_EMAILS = ['aizubrandhall@gmail.com']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  /* Google から返る ?code=xxx はミドルウェア適用外 */
  if (req.nextUrl.searchParams.has('code')) return res

  const supabase = createMiddlewareClient({
    req,
    res,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !ALLOWED_EMAILS.includes(user.email ?? ''))
    return NextResponse.redirect(new URL('/unauthorized', req.url))

  return res
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|login|unauthorized).*)'],
}
