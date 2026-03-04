// /api/kpi/ai-forecast/route.ts - AI年度末売上予測 (Gemini 2.0 Flash)
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_MODEL = "gemini-2.0-flash";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { fiscalYear, monthlyData } = await req.json();

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ ok: false, error: "GEMINI_API_KEY is not set" }, { status: 500 });
        }

        // monthlyData format: { months: string[], channels: { [code]: { month, actual, target, lastYear }[] }, total: { month, actual, target, lastYear }[] }

        const prompt = buildForecastPrompt(fiscalYear, monthlyData);

        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse the forecast amount from AI response
        const forecast = parseForecastAmount(text);

        return NextResponse.json({
            ok: true,
            forecast,
            reasoning: text,
            generatedAt: new Date().toISOString(),
        });

    } catch (e: any) {
        console.error('AI予測エラー:', e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

function buildForecastPrompt(fiscalYear: number, data: any): string {
    // Build monthly summary
    const totalData = data.total || [];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    let monthlyBreakdown = '';
    let actualMonths = 0;
    let totalActual = 0;
    let totalLastYear = 0;
    let totalTarget = 0;

    totalData.forEach((m: any) => {
        const isElapsed = m.month < currentMonth;
        const status = isElapsed ? (m.actual > 0 ? '実績確定' : '未入力') : '未到来';
        monthlyBreakdown += `${m.month}: 前年=${m.lastYear.toLocaleString()}円, 目標=${m.target.toLocaleString()}円, 実績=${m.actual.toLocaleString()}円 [${status}]\n`;
        if (isElapsed && m.actual > 0) {
            actualMonths++;
            totalActual += m.actual;
        }
        totalLastYear += m.lastYear;
        totalTarget += m.target;
    });

    // Channel breakdown
    let channelBreakdown = '';
    if (data.channels) {
        const channelNames: Record<string, string> = {
            'SHOKU': '道の駅 食のブランド館',
            'STORE': '会津ブランド館（店舗）',
            'WEB': '会津ブランド館（ネット販売）',
            'WHOLESALE': '外販・OEM 本社売上',
        };
        for (const [code, name] of Object.entries(channelNames)) {
            const rows = data.channels[code] || [];
            const chActual = rows.reduce((s: number, r: any) => s + r.actual, 0);
            const chLastYear = rows.reduce((s: number, r: any) => s + r.lastYear, 0);
            const chTarget = rows.reduce((s: number, r: any) => s + r.target, 0);
            channelBreakdown += `${name}: 前年計=${chLastYear.toLocaleString()}円, 目標計=${chTarget.toLocaleString()}円, 実績累計=${chActual.toLocaleString()}円\n`;
        }
    }

    return `あなたは売上予測の専門家AIです。以下のデータから、FY${fiscalYear}（${fiscalYear - 1}年8月〜${fiscalYear}年7月）の年度末売上着地予想を算出してください。

【月別データ（総合計）】
${monthlyBreakdown}

【チャネル別累計】
${channelBreakdown}

【サマリー】
- 実績確定月数: ${actualMonths}ヶ月
- 実績累計: ${totalActual.toLocaleString()}円
- 前年度年間実績: ${totalLastYear.toLocaleString()}円
- 今年度目標合計: ${totalTarget.toLocaleString()}円

【予測ルール】
1. 実績が入っている月はその金額をそのまま使用
2. 実績が未入力の月は、以下を総合的に考慮して予測:
   - 前年同月の実績（季節性反映）
   - 今年度の実績推移トレンド（前年比の伸び率）
   - 目標値との乖離
   - チャネルごとの傾向
3. 全12ヶ月の合計として年度末着地予想を一つの数値（円単位、整数）で出力

【出力フォーマット】
以下の形式で出力してください。必ず金額を最初の行に記載してください:
FORECAST: [数値のみ（カンマなし）]
REASONING: [予測根拠を2-3文で簡潔に]`;
}

function parseForecastAmount(text: string): number {
    // Look for FORECAST: pattern
    const match = text.match(/FORECAST:\s*(\d+)/);
    if (match) {
        return parseInt(match[1], 10);
    }

    // Fallback: find large numbers in text
    const numbers = text.match(/\d{6,}/g);
    if (numbers && numbers.length > 0) {
        return parseInt(numbers[0], 10);
    }

    return 0;
}
