// /app/api/finance/ai-query/route.ts ver.2
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { question, reportMonth } = await request.json();

    if (!question || !reportMonth) {
      return NextResponse.json(
        { error: '質問と対象月を指定してください' },
        { status: 400 }
      );
    }

    // 質問を解析してSQLクエリを生成し実行
    const queryResult = await analyzeQuestionAndQuery(question, reportMonth);
    
    return NextResponse.json({ 
      response: queryResult.response,
      data: queryResult.data 
    });

  } catch (error: any) {
    console.error('AI Query Error:', error);
    return NextResponse.json(
      { error: 'クエリ処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

async function analyzeQuestionAndQuery(question: string, reportMonth: string) {
  const lowerQuestion = question.toLowerCase();
  const reportMonthDate = `${reportMonth}-01`;

  try {
    // キーワードベースの解析
    let data: any[] = [];
    let responseType = 'detail';

    // 「電気代」関連の質問
    if (lowerQuestion.includes('電気') || lowerQuestion.includes('電力')) {
      const { data: result, error } = await supabase
        .from('general_ledger')
        .select(`
          transaction_date,
          account_code,
          counter_account,
          description,
          debit_amount,
          credit_amount,
          balance,
          account_master!inner(account_name)
        `)
        .eq('report_month', reportMonthDate)
        .or('description.ilike.%電気%,description.ilike.%電力%,counter_account.ilike.%電気%,counter_account.ilike.%電力%')
        .order('transaction_date');

      if (error) throw error;
      data = result || [];
      responseType = 'detail';
    }
    // 「広告費」関連の質問
    else if (lowerQuestion.includes('広告') || lowerQuestion.includes('宣伝')) {
      const { data: result, error } = await supabase
        .from('general_ledger')
        .select(`
          transaction_date,
          account_code,
          counter_account,
          description,
          debit_amount,
          credit_amount,
          balance,
          account_master!inner(account_name)
        `)
        .eq('report_month', reportMonthDate)
        .or('description.ilike.%広告%,description.ilike.%メルカリ%,description.ilike.%プロモーション%,counter_account.ilike.%広告%')
        .order('transaction_date');

      if (error) throw error;
      data = result || [];
      responseType = 'detail';
    }
    // 「水道」関連の質問
    else if (lowerQuestion.includes('水道')) {
      const { data: result, error } = await supabase
        .from('general_ledger')
        .select(`
          transaction_date,
          account_code,
          counter_account,
          description,
          debit_amount,
          credit_amount,
          balance,
          account_master!inner(account_name)
        `)
        .eq('report_month', reportMonthDate)
        .or('description.ilike.%水道%,counter_account.ilike.%水道%')
        .order('transaction_date');

      if (error) throw error;
      data = result || [];
      responseType = 'detail';
    }
    // 「通信費」関連の質問
    else if (lowerQuestion.includes('通信')) {
      const { data: result, error } = await supabase
        .from('general_ledger')
        .select(`
          transaction_date,
          account_code,
          counter_account,
          description,
          debit_amount,
          credit_amount,
          balance,
          account_master!inner(account_name)
        `)
        .eq('report_month', reportMonthDate)
        .or('description.ilike.%通信%,description.ilike.%電話%,description.ilike.%インターネット%')
        .order('transaction_date');

      if (error) throw error;
      data = result || [];
      responseType = 'detail';
    }
    // 合計を求める質問
    else if (lowerQuestion.includes('合計') || lowerQuestion.includes('総額')) {
      let condition = '';
      
      if (lowerQuestion.includes('売上')) {
        condition = 'account_master.account_name.ilike.%売上%';
      } else if (lowerQuestion.includes('仕入')) {
        condition = 'account_master.account_name.ilike.%仕入%';
      } else if (lowerQuestion.includes('給料') || lowerQuestion.includes('給与')) {
        condition = 'account_master.account_name.ilike.%給%';
      }

      if (condition) {
        const { data: result, error } = await supabase
          .from('general_ledger')
          .select(`
            account_code,
            debit_amount,
            credit_amount,
            account_master!inner(account_name)
          `)
          .eq('report_month', reportMonthDate);

        if (error) throw error;
        
        // フィルタリングと集計
        const filtered = (result || []).filter(item => {
          const name = item.account_master?.account_name || '';
          if (lowerQuestion.includes('売上')) return name.includes('売上');
          if (lowerQuestion.includes('仕入')) return name.includes('仕入');
          if (lowerQuestion.includes('給')) return name.includes('給');
          return false;
        });

        // 勘定科目ごとに集計
        const summary = new Map();
        filtered.forEach(item => {
          const key = item.account_master?.account_name || '不明';
          if (!summary.has(key)) {
            summary.set(key, { 
              name: key, 
              debit: 0, 
              credit: 0, 
              count: 0 
            });
          }
          const s = summary.get(key);
          s.debit += item.debit_amount || 0;
          s.credit += item.credit_amount || 0;
          s.count += 1;
        });

        data = Array.from(summary.values());
        responseType = 'total';
      }
    }
    // デフォルト：最新の取引
    else {
      const { data: result, error } = await supabase
        .from('general_ledger')
        .select(`
          transaction_date,
          account_code,
          counter_account,
          description,
          debit_amount,
          credit_amount,
          balance,
          account_master!inner(account_name)
        `)
        .eq('report_month', reportMonthDate)
        .order('transaction_date', { ascending: false })
        .limit(20);

      if (error) throw error;
      data = result || [];
      responseType = 'recent';
    }

    // 結果をフォーマット
    return formatQueryResult(data, responseType, question);

  } catch (error) {
    console.error('Query execution error:', error);
    return {
      response: 'データの取得中にエラーが発生しました。',
      data: []
    };
  }
}

function formatQueryResult(data: any[], responseType: string, question: string) {
  if (!data || data.length === 0) {
    return {
      response: `「${question}」に該当するデータが見つかりませんでした。`,
      data: []
    };
  }

  let response = '';
  
  switch (responseType) {
    case 'detail':
      response = `「${question}」の検索結果：\n\n`;
      response += '日付\t\t摘要\t\t\t\t\t借方\t\t貸方\n';
      response += '─'.repeat(80) + '\n';
      
      let totalDebit = 0;
      let totalCredit = 0;
      
      data.forEach(row => {
        const date = row.transaction_date ? 
          new Date(row.transaction_date).toLocaleDateString('ja-JP', { 
            month: '2-digit', 
            day: '2-digit' 
          }) : '';
        
        // 摘要を適切な長さに調整
        let desc = (row.description || '').replace(/\s+/g, ' ');
        if (desc.length > 30) {
          desc = desc.substring(0, 30) + '...';
        }
        
        const debit = row.debit_amount || 0;
        const credit = row.credit_amount || 0;
        
        totalDebit += debit;
        totalCredit += credit;
        
        response += `${date}\t${desc.padEnd(40, ' ')}\t${debit.toLocaleString().padStart(10)}\t${credit.toLocaleString().padStart(10)}\n`;
      });
      
      response += '─'.repeat(80) + '\n';
      response += `合計\t\t\t\t\t\t\t${totalDebit.toLocaleString().padStart(10)}\t${totalCredit.toLocaleString().padStart(10)}\n`;
      response += `\n件数: ${data.length}件`;
      break;
      
    case 'total':
      response = `「${question}」の集計結果：\n\n`;
      
      let grandTotalDebit = 0;
      let grandTotalCredit = 0;
      
      data.forEach(item => {
        response += `${item.name}:\n`;
        response += `  取引件数: ${item.count}件\n`;
        response += `  借方合計: ${item.debit.toLocaleString()}円\n`;
        response += `  貸方合計: ${item.credit.toLocaleString()}円\n`;
        response += `  差額: ${(item.debit - item.credit).toLocaleString()}円\n\n`;
        
        grandTotalDebit += item.debit;
        grandTotalCredit += item.credit;
      });
      
      response += '─'.repeat(40) + '\n';
      response += `総合計:\n`;
      response += `  借方: ${grandTotalDebit.toLocaleString()}円\n`;
      response += `  貸方: ${grandTotalCredit.toLocaleString()}円\n`;
      response += `  差額: ${(grandTotalDebit - grandTotalCredit).toLocaleString()}円`;
      break;
      
    case 'recent':
      response = `最新の取引データ（20件）：\n\n`;
      response += '日付\t\t勘定科目\t\t摘要\t\t\t\t借方\t\t貸方\n';
      response += '─'.repeat(80) + '\n';
      
      data.slice(0, 20).forEach(row => {
        const date = row.transaction_date ? 
          new Date(row.transaction_date).toLocaleDateString('ja-JP', { 
            month: '2-digit', 
            day: '2-digit' 
          }) : '';
        
        const account = (row.account_master?.account_name || '').substring(0, 10);
        let desc = (row.description || '').replace(/\s+/g, ' ');
        if (desc.length > 25) {
          desc = desc.substring(0, 25) + '...';
        }
        
        const debit = row.debit_amount || 0;
        const credit = row.credit_amount || 0;
        
        response += `${date}\t${account.padEnd(12, ' ')}\t${desc.padEnd(30, ' ')}\t${debit.toLocaleString().padStart(10)}\t${credit.toLocaleString().padStart(10)}\n`;
      });
      break;
      
    default:
      response = JSON.stringify(data, null, 2);
  }
  
  return { response, data };
}
