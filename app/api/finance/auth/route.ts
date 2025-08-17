// /app/api/finance/auth/route.ts ver.2
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// 環境変数にパスワードを設定
const ADMIN_PASSWORD = process.env.FINANCE_ADMIN_PASSWORD || 'admin2025';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (password === ADMIN_PASSWORD) {
      // 認証成功時にCookieを設定
      cookies().set('finance-auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7日間有効
        path: '/',
      });
      
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Authentication error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Cookieから認証状態を確認
    const authCookie = cookies().get('finance-auth');
    const authenticated = authCookie?.value === 'authenticated';
    
    return NextResponse.json({ authenticated }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}

export async function DELETE() {
  try {
    // ログアウト処理（Cookieを削除）
    cookies().delete('finance-auth');
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Logout error' }, { status: 500 });
  }
}
