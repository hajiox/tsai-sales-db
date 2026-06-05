import { NextResponse } from 'next/server';
import { parseTsgJsonResponse } from '@/lib/tsg-integration-response';

function getTsgBaseUrl() {
    return (process.env.TSG_INTEGRATION_BASE_URL?.trim() || 'https://v0-line-blush.vercel.app').replace(/\/$/, '');
}

function getTsgSecret() {
    return process.env.TSG_INTEGRATION_SECRET?.trim() || '';
}

export async function GET() {
    const secret = getTsgSecret();
    if (!secret) {
        return NextResponse.json({ error: 'TSG_INTEGRATION_SECRET is not configured' }, { status: 500 });
    }

    try {
        const res = await fetch(`${getTsgBaseUrl()}/api/integrations/tsa/daily-report`, {
            cache: 'no-store',
            headers: {
                'x-tsg-integration-secret': secret,
            },
        });
        const data = await parseTsgJsonResponse(res);
        if (!res.ok) {
            return NextResponse.json({ error: data.error || 'TSG投稿者一覧の取得に失敗しました' }, { status: res.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'TSG投稿者一覧の取得に失敗しました' },
            { status: 500 }
        );
    }
}
