// app/api/finance/ai-analysis/route.ts ver.1
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 環境変数の取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY || "";

// Gemini APIクライアントの初期化
const genAI = new GoogleGenerativeAI(geminiApiKey);

export async function POST(request: Request) {
  try {
    const { month } = await request.json(); // ex: "2025-04"

    if (!month) {
      return NextResponse.json({ error: "Month is required" }, { status: 400 });
    }

    // 1. 日付計算（当月と、過去3ヶ月の範囲を決定）
    const currentMonthDate = new Date(`${month}-01`);
    const threeMonthsAgoDate = new Date(currentMonthDate);
    threeMonthsAgoDate.setMonth(currentMonthDate.getMonth() - 3);

    // Supabaseクライアント作成
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. 過去3ヶ月〜当月のデータを取得 (monthly_account_balance)
    // 必要なのは「費用」データ（コード400番台以降）や比較に必要なデータ
    const { data: records, error } = await supabase
      .from("monthly_account_balance")
      .select(`
        account_code,
        report_month,
        total_debit,
        total_credit,
        account_master!inner(account_name)
      `)
      .gte("report_month", threeMonthsAgoDate.toISOString().slice(0, 10))
      .lte("report_month", `${month}-01`);

    if (error) throw error;
    
    // データがない場合の早期リターン
    if (!records || records.length === 0) {
      return NextResponse.json({ 
        anomalies: [], 
        aiComment: "データが不足しているため分析できませんでした。" 
      });
    }

    // 3. データ集計
    // account_code ごとにデータを整理
    const accountStats: Record<string, { current: number; pastSum: number; pastCount: number; name: string }> = {};

    records.forEach((r: any) => {
      // 費用の残高 = 借方(total_debit) を使用
      const amount = r.total_debit; 
      const isCurrentMonth = r.report_month === `${month}-01`;
      const name = r.account_master?.account_name || "不明な科目";
      
      // 簡易的な分類チェック: コード400未満（資産・負債・純資産）は分析対象外とする
      // ※より厳密にするなら account_type も参照すべきですが、今回はコードで簡易判定します
      const codeNum = parseInt(r.account_code);
      if (isNaN(codeNum) || codeNum < 400) return; 

      if (!accountStats[r.account_code]) {
        accountStats[r.account_code] = { current: 0, pastSum: 0, pastCount: 0, name };
      }

      if (isCurrentMonth) {
        accountStats[r.account_code].current = amount;
      } else {
        accountStats[r.account_code].pastSum += amount;
        accountStats[r.account_code].pastCount += 1;
      }
    });

    // 4. 異常検知ロジック
    const anomalies = [];

    for (const [code, stat] of Object.entries(accountStats)) {
      // 過去データがない場合は比較できないのでスキップ
      if (stat.pastCount === 0) continue;

      const avg = stat.pastSum / stat.pastCount;
      
      // ノイズ除去: 当月の金額が5万円未満なら無視
      if (stat.current < 50000) continue;

      // 異常判定:
      // (1) 平均より大きい
      // (2) 増加額が5万円以上 (diff >= 50000)
      // (3) 増加率が20%以上 (ratio >= 0.2)
      if (avg > 0) {
        const diff = stat.current - avg;
        const ratio = diff / avg;

        if (ratio >= 0.2 && diff >= 50000) {
          anomalies.push({
            code,
            name: stat.name,
            current: stat.current,
            average: Math.floor(avg),
            diff: Math.floor(diff),
            ratio: Math.floor(ratio * 100)
          });
        }
      } else if (stat.current > 100000) {
        // 過去実績が0円（avg=0）なのに、急に10万円以上発生した場合も異常
        anomalies.push({
          code,
          name: stat.name,
          current: stat.current,
          average: 0,
          diff: stat.current,
          ratio: 100 // 新規発生扱い(便宜上100%)
        });
      }
    }

    // ソート: 金額の増加幅（diff）が大きい順
    anomalies.sort((a, b) => b.diff - a.diff);

    // 5. Gemini APIでコメント生成
    let aiComment = "特筆すべき異常値は見当たりません。順調な推移です。";

    if (anomalies.length > 0) {
      // トークン節約のため上位5件のみをAIに渡す
      const topAnomalies = anomalies.slice(0, 5);
      
      const prompt = `
        あなたはプロの財務分析官です。以下の経費データは、直近3ヶ月の平均と比較して急増した科目です。
        経営者に向けて、簡潔な日本語で以下の点を含めてレポートしてください。
        
        1. 全体的な傾向（どの分野のコストが増えているか）
        2. 特に注意すべき科目とその増加額
        3. 想定されるリスクや、現場に確認すべき質問（例：「〇〇の購入がありましたか？」など）
        
        【異常データリスト】
        ${topAnomalies.map(a => 
          `- ${a.name}: 今月${a.current.toLocaleString()}円 (平均比 +${a.ratio}%, +${a.diff.toLocaleString()}円)`
        ).join("\n")}
        
        回答はMarkdown形式を使わず、プレーンテキストで、300文字以内で簡潔にまとめてください。
      `;

      try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        if (text) {
          aiComment = text;
        }
      } catch (aiError) {
        console.error("Gemini API Error:", aiError);
        aiComment = "AI分析の生成中にエラーが発生しましたが、数値データの集計は完了しています。リストを確認してください。";
      }
    }

    return NextResponse.json({
      month,
      anomalies,
      aiComment
    });

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json(
      { error: error.message || "Analysis failed" },
      { status: 500 }
    );
  }
}
