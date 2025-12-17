// /app/api/ai-tools/generate-description/route.ts ver.3
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { url, name } = await request.json();

    if (!url || !name) {
      return NextResponse.json(
        { error: 'URLと名前が必要です' },
        { status: 400 }
      );
    }

    // Gemini APIキーの確認
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY が設定されていません');
      return NextResponse.json(
        { error: 'API設定エラー' },
        { status: 500 }
      );
    }

    // プロンプト作成
    const prompt = `あなたは中学生でもわかるように、AIツールを説明する専門家です。

以下のAIツールについて、最新情報をもとに説明してください：

AIツール名: ${name}
URL: ${url}

以下の形式で回答してください：

【このAIは何？】
（2-3行で簡潔に説明）

【できること】
- 箇条書きで3-5個
- 具体例を含める

【簡単な使い方】
1. ステップ1
2. ステップ2
3. ステップ3

【注意点】
- 無料/有料について
- その他重要なポイント

必ず中学生でもわかる言葉で、専門用語は避けてください。`;

    // Gemini API呼び出し（最新の安定版モデル）
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API エラー:', errorData);
      return NextResponse.json(
        { error: 'AI説明の生成に失敗しました' },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    // レスポンスからテキストを抽出
    const description = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!description) {
      return NextResponse.json(
        { error: '説明の生成に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      description: description
    });

  } catch (error) {
    console.error('説明生成エラー:', error);
    return NextResponse.json(
      { error: '説明の生成に失敗しました' },
      { status: 500 }
    );
  }
}
