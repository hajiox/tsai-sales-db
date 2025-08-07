// /app/api/finance/auth/route.ts ver.1
import { NextResponse } from 'next/server';

// 環境変数にパスワードを設定
const ADMIN_PASSWORD = process.env.FINANCE_ADMIN_PASSWORD || 'admin2025';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (password === ADMIN_PASSWORD) {
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Authentication error' }, { status: 500 });
  }
}
