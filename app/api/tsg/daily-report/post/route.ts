import { NextRequest, NextResponse } from 'next/server';
import { parseTsgJsonResponse } from '@/lib/tsg-integration-response';

function getTsgBaseUrl() {
    return (process.env.TSG_INTEGRATION_BASE_URL?.trim() || 'https://v0-line-blush.vercel.app').replace(/\/$/, '');
}

function getTsgSecret() {
    return process.env.TSG_INTEGRATION_SECRET?.trim() || '';
}

export async function POST(request: NextRequest) {
    const secret = getTsgSecret();
    if (!secret) {
        return NextResponse.json({ error: 'TSG_INTEGRATION_SECRET is not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';

    if (!userId) {
        return NextResponse.json({ error: '投稿者を選択してください' }, { status: 400 });
    }
    if (!content.trim()) {
        return NextResponse.json({ error: '投稿内容がありません' }, { status: 400 });
    }

    try {
        const res = await fetch(`${getTsgBaseUrl()}/api/integrations/tsa/daily-report`, {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                'x-tsg-integration-secret': secret,
            },
            body: JSON.stringify({ userId, content }),
        });
        const data = await parseTsgJsonResponse(res);
        if (!res.ok) {
            return NextResponse.json({ error: data.error || 'TSGへの投稿に失敗しました' }, { status: res.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'TSGへの投稿に失敗しました' },
            { status: 500 }
        );
    }
}
