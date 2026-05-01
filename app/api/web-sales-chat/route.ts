import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export async function POST(request: NextRequest) {
    try {
        const { messages, month } = await request.json() as {
            messages: ChatMessage[];
            month: string;
        };

        if (!messages || messages.length === 0) {
            return NextResponse.json({ success: false, error: 'メッセージは必須です' }, { status: 400 });
        }

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            return NextResponse.json({ success: false, error: 'GEMINI_API_KEY未設定' }, { status: 500 });
        }

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
        
        const supabase = createClient(url, key, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // 対象月から過去6ヶ月分の日付を計算
        const [year, monthNum] = month.split('-').map(Number);
        const dateObj = new Date(year, monthNum - 1, 1);
        const past6MonthsObj = new Date(dateObj);
        past6MonthsObj.setMonth(dateObj.getMonth() - 5);
        const startMonth6 = `${past6MonthsObj.getFullYear()}-${String(past6MonthsObj.getMonth() + 1).padStart(2, '0')}`;

        // 過去6ヶ月分のデータを取得
        const { data: periodSalesData, error: periodError } = await supabase.rpc('get_period_sales_data', {
            start_month: startMonth6,
            end_month: month
        });

        // 財務データの推移も取得（売上、広告費、利益）
        const { data: chartData } = await supabase.rpc('get_monthly_chart_data', {
            start_month: startMonth6,
            end_month: month
        });

        // 今月のトレンドデータ取得
        const { data: trendData } = await supabase.rpc('get_product_trend_analysis', {
            target_month: month
        });

        // コンテキストの文字列化
        const contextString = `
## 分析対象月: ${month} (過去6ヶ月: ${startMonth6} 〜 ${month})

### 過去6ヶ月の月次売上推移
${JSON.stringify(chartData?.map((d: any) => ({
    月: d.month_label,
    Amazon: d.amazon_count,
    楽天: d.rakuten_count,
    Yahoo: d.yahoo_count,
    合計販売数: d.total_count
})), null, 2)}

### 急上昇・急落商品 (対象月: ${month})
${JSON.stringify((trendData || []).filter((d: any) => ['新規成長', '大幅成長', '成長', '急激衰退', '大幅衰退', '衰退'].includes(d.trend_type)).map((d: any) => ({
    商品名: d.product_name,
    トレンド: d.trend_type,
    変化率: d.trend_rate,
    当月売上: d.current_sales
})), null, 2)}

### 過去6ヶ月の累計販売実績
${JSON.stringify(periodSalesData?.slice(0, 20).map((d: any) => ({ // 上位20件のみ
    商品ID: d.product_id,
    合計販売数: d.total_count,
    Amazon: d.amazon_count,
    楽天: d.rakuten_count
})), null, 2)}
`;

        const systemPrompt = `あなたはWEB販売管理システムの専属AIデータアナリストです。
EC事業者（Amazon, 楽天, Yahoo等）の売上データを分析し、ユーザーからの質問に答えるプロフェッショナルです。

以下のデータベースから取得した実績データ（過去6ヶ月分）を元に回答してください。

${contextString}

## 回答ルール
- 日本語で回答してください。
- 質問に対して的確かつ具体的に回答してください。
- 提供されたデータに基づいた分析・提案を行ってください（推測の場合はその旨を明記）。
- 数値やパーセンテージを具体的に引用して説得力を持たせてください。
- チャット形式なので、長すぎず、会話として自然な長さに留めてください（必要に応じて箇条書きを活用）。
- 経営者向けの鋭い視点と、実用的な改善アクションを提案してください。`;

        // Gemini API用の会話履歴を構築
        const contents = [
            {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\n' + messages[0].text }]
            }
        ];

        // 2つ目以降のメッセージを追加
        for (let i = 1; i < messages.length; i++) {
            contents.push({
                role: messages[i].role === 'user' ? 'user' : 'model',
                parts: [{ text: messages[i].text }]
            });
        }

        // TSA全体で使用している一番賢いモデル (gemini-2.5-pro) を使用
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents }),
            }
        );

        if (!geminiRes.ok) {
            const err = await geminiRes.text();
            throw new Error(`Gemini API Error: ${err}`);
        }

        const geminiData = await geminiRes.json();
        const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
            || '回答を生成できませんでした。もう一度お試しください。';

        return NextResponse.json({ success: true, reply });
    } catch (error: any) {
        console.error('WebSales AI Chat Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
