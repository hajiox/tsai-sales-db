// /app/api/links/fetch-ogp/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json(
        { error: 'URLが必要です' },
        { status: 400 }
      )
    }

    // URLの形式チェック
    let targetUrl = url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      targetUrl = 'https://' + url
    }

    // ページのHTMLを取得
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `ページの取得に失敗しました: ${response.status}` },
        { status: 400 }
      )
    }

    const html = await response.text()

    // OGPタグを抽出
    const ogTitle = extractMetaContent(html, 'og:title')
    const ogDescription = extractMetaContent(html, 'og:description')
    const ogImage = extractMetaContent(html, 'og:image')

    // OGPがない場合は通常のメタタグから取得
    const title = ogTitle || extractTitle(html) || extractMetaContent(html, 'title')
    const description = ogDescription || extractMetaName(html, 'description')

    // 相対パスの画像URLを絶対パスに変換
    let imageUrl = ogImage
    if (ogImage && !ogImage.startsWith('http')) {
      const urlObj = new URL(targetUrl)
      if (ogImage.startsWith('/')) {
        imageUrl = `${urlObj.protocol}//${urlObj.host}${ogImage}`
      } else {
        imageUrl = `${urlObj.protocol}//${urlObj.host}/${ogImage}`
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        url: targetUrl,
        title: title || '',
        description: description || '',
        og_image: imageUrl || '',
      }
    })

  } catch (error) {
    console.error('OGP取得エラー:', error)
    return NextResponse.json(
      { error: 'OGP情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// OGPメタタグからcontentを抽出
function extractMetaContent(html: string, property: string): string | null {
  // property属性のパターン
  const propertyPattern = new RegExp(
    `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  )
  // content属性が先に来るパターン
  const contentFirstPattern = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["'][^>]*>`,
    'i'
  )

  const match = html.match(propertyPattern) || html.match(contentFirstPattern)
  return match ? decodeHtmlEntities(match[1]) : null
}

// name属性のメタタグからcontentを抽出
function extractMetaName(html: string, name: string): string | null {
  const namePattern = new RegExp(
    `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  )
  const contentFirstPattern = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["'][^>]*>`,
    'i'
  )

  const match = html.match(namePattern) || html.match(contentFirstPattern)
  return match ? decodeHtmlEntities(match[1]) : null
}

// titleタグを抽出
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match ? decodeHtmlEntities(match[1].trim()) : null
}

// HTMLエンティティをデコード
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}
