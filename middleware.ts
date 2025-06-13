import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SUPABASE_URL  = 'https://zrerpexdsaxqztqqrwwv.supabase.co'
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…KNec'
const ALLOWED       = ['aizubrandhall@gmail.com']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Google OAuth 戻りの ?code= はスキップ
  if (req.nextUrl.searchParams.has('code')) return res

  const supabase = createMiddlewareClient({
    req, res,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  })

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !ALLOWED.includes(user.email ?? ''))
      return NextResponse.redirect(new URL('/login', req.url))
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return res
}

export const config = {
  matcher: ['/', '/((?!_next/|favicon.ico|login|unauthorized).*)'],
}
