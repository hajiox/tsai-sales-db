import http from 'node:http'
import { config } from 'dotenv'

config({ path: '.env.local' })
config()

const port = Number(process.env.GOOGLE_ADS_OAUTH_PORT || 8080)
const redirectUri = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI || `http://localhost:${port}/oauth2callback`
const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const scope = 'https://www.googleapis.com/auth/adwords'

if (!clientId || !clientSecret) {
  console.error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', redirectUri)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', scope)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', redirectUri)
    if (requestUrl.pathname !== new URL(redirectUri).pathname) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const code = requestUrl.searchParams.get('code')
    const oauthError = requestUrl.searchParams.get('error')
    if (oauthError) throw new Error(oauthError)
    if (!code) throw new Error('Authorization code is missing.')

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok || tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error || `Token exchange failed: ${tokenResponse.status}`)
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Google Ads refresh token was issued. You can close this tab.')

    console.log('\nGOOGLE_ADS_REFRESH_TOKEN=' + tokenData.refresh_token)
    console.log('\nUpdate this value in Vercel and .env.local, then redeploy.')
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(error.message)
    console.error(error)
  } finally {
    server.close()
  }
})

server.listen(port, () => {
  console.log(`Listening on ${redirectUri}`)
  console.log('\nOpen this URL in a browser:\n')
  console.log(authUrl.toString())
  console.log('\nIf Google rejects redirect_uri, add it to the OAuth client authorized redirect URIs first.')
})
