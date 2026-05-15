import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken, isGoogleAdsReauthRequiredError } from '@/lib/google-ads-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    try {
        await getGoogleAdsAccessToken()
        return NextResponse.json({
            success: true,
            checkedAt: new Date().toISOString(),
        })
    } catch (error: any) {
        if (isGoogleAdsReauthRequiredError(error)) {
            return NextResponse.json(
                {
                    success: false,
                    code: 'GOOGLE_ADS_REAUTH_REQUIRED',
                    reauthRequired: true,
                    error: error.message,
                    checkedAt: new Date().toISOString(),
                },
                { status: 401 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Google広告トークンの確認に失敗しました',
                checkedAt: new Date().toISOString(),
            },
            { status: 500 }
        )
    }
}
