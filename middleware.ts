// middleware.ts
import { createMiddlewareSupabaseClient } from '@supabase/auth-helpers/nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_EMAILS = ['aizubrandhall@gmail.com']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareSupabaseClient({ req, res })
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ALLOWED_EMAILS.includes(user.email ?? '')) {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
