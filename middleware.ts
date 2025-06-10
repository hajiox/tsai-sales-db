import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SUPABASE_URL = 'https://zrerpexdsaxqztqqrwwv.supabase.co'
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzNjAzOTgsImV4cCI6MjA2NDkzNjM5OH0.nVWvJfsSAC7dnNCuXLxoN5OvQ4ShQI5FOwipkMlKNec'

const ALLOWED_EMAILS = ['aizubrandhall@gmail.com']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Google から返る最初の ?code=xxx はスキップ
  if (req.nextUrl.searchParams.has('code')) return res

  const supabase = createMiddlewareClient({
    req,
    res,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  })

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !ALLOWED_EMAILS.includes(user.email ?? '')) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
  } catch {
    // Cookie なし・タイムアウトなどはログインへ
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|login|unauthorized).*)'],
}
