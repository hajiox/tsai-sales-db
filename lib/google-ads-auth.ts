export class GoogleAdsReauthRequiredError extends Error {
    constructor(message = 'Google広告の認証期限が切れています。Google広告を再連携してください。') {
        super(message)
        this.name = 'GoogleAdsReauthRequiredError'
    }
}

export function isGoogleAdsReauthRequiredError(error: unknown): error is GoogleAdsReauthRequiredError {
    return error instanceof GoogleAdsReauthRequiredError
}

function isRefreshTokenExpired(data: any) {
    const error = String(data?.error || '').toLowerCase()
    const description = String(data?.error_description || '').toLowerCase()
    return error === 'invalid_grant' || description.includes('expired') || description.includes('revoked')
}

export async function getGoogleAdsAccessToken(): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
        const missing = []
        if (!clientId) missing.push('GOOGLE_CLIENT_ID')
        if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET')
        if (!refreshToken) missing.push('GOOGLE_ADS_REFRESH_TOKEN')
        throw new Error(`環境変数が未設定: ${missing.join(', ')}`)
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    })

    const data = await response.json()
    if (data.error) {
        console.error('OAuth token error details:', JSON.stringify(data))
        if (isRefreshTokenExpired(data)) {
            throw new GoogleAdsReauthRequiredError()
        }
        throw new Error(`Token error: ${data.error_description || data.error}`)
    }

    return data.access_token
}
