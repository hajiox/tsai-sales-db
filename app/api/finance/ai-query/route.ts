// /app/api/finance/ai-query/route.ts ver.1
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

    // 質問を解析してSQLクエリを生成
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

  // キーワードベースの解析（GPT-4o-miniを使用する前の簡易処理）
  let sqlQuery = '';
  let responseType = 'detail'; // detail, summary, total

  // 広告費、電気代などの特定科目を探す
  if (lowerQuestion.includes('広告') || lowerQuestion.includes('宣伝')) {
    sqlQuery = `
      SELECT 
        gl.transaction_date,
        am.account_name,
        gl.counter_account,
        gl.description,
        gl.debit_amount,
        gl.credit_amount,
        gl.balance
      FROM general_ledger gl
      JOIN account_master am ON gl.account_code = am.account_code
      WHERE gl.report_month = '${reportMonthDate}'
        AND (
          am.account_name LIKE '%広告%' 
          OR gl.description LIKE '%広告%'
          OR gl.description LIKE '%メルカリ%'
          OR gl.description LIKE '%プロモーション%'
        )
      ORDER BY gl.transaction_date, gl.id
    `;
    responseType = 'detail';
  }
  else if (lowerQuestion.includes('電気') || lowerQuestion.includes('電力')) {
    sqlQuery = `
      SELECT 
        gl.transaction_date,
        am.account_name,
        gl.counter_account,
        gl.description,
        gl.debit_amount,
        gl.credit_amount
      FROM general_ledger gl
      JOIN account_master am ON gl.account_code = am.account_code
      WHERE gl.report_month = '${reportMonthDate}'
        AND (
          am.account_name LIKE '%電気%' 
          OR am.account_name LIKE '%光熱%'
          OR gl.description LIKE '%電気%'
          OR gl.description LIKE '%電力%'
          OR gl.counter_account LIKE '%電気%'
        )
      ORDER BY gl.transaction_date, gl.id
    `;
    responseType = 'detail';
  }
  else if (lowerQuestion.includes('水道')) {
    sqlQuery = `
      SELECT 
        gl.transaction_date,
        am.account_name,
        gl.counter_account,
        gl.description,
        gl.debit_amount,
        gl.credit_amount
      FROM general_ledger gl
      JOIN account_master am ON gl.account_code = am.account_code
      WHERE gl.report_month = '${reportMonthDate}'
        AND (
          am.account_name LIKE '%水道%' 
          OR am.account_name LIKE '%光熱%'
          OR gl.description LIKE '%水道%'
        )
      ORDER BY gl.transaction_date, gl.id
    `;
    responseType = 'detail';
  }
  else if (lowerQuestion.includes('通信費')) {
    sqlQuery = `
      SELECT 
        gl.transaction_date,
        am.account_name,
        gl.counter_account,
        gl.description,
        gl.debit_amount,
        gl.credit_amount
      FROM general_ledger gl
      JOIN account_master am ON gl.account_code = am.account_code
      WHERE gl.report_month = '${reportMonthDate}'
        AND (
          am.account_name LIKE '%通信%' 
          OR gl.description LIKE '%通信%'
          OR gl.description LIKE '%電話%'
          OR gl.description LIKE '%インターネット%'
        )
      ORDER BY gl.transaction_date, gl.id
    `;
    responseType = 'detail';
  }
  // 合計や集計を求める質問
  else if (lowerQuestion.includes('合計') || lowerQuestion.includes('総額') || lowerQuestion.includes('いくら')) {
    // 特定の勘定科目名を探す
    let accountCondition = '';
    
    if (lowerQuestion.includes('売上')) {
      accountCondition = "am.account_name LIKE '%売上%'";
      responseType = 'total';
    } else if (lowerQuestion.includes('仕入')) {
      accountCondition = "am.account_name LIKE '%仕入%'";
      responseType = 'total';
    } else if (lowerQuestion.includes('給料') || lowerQuestion.includes('給与')) {
      accountCondition = "am.account_name LIKE '%給%'";
      responseType = 'total';
    } else if (lowerQuestion.includes('家賃') || lowerQuestion.includes('賃料')) {
      accountCondition = "(am.account_name LIKE '%家賃%' OR am.account_name LIKE '%賃%' OR gl.description LIKE '%家賃%')";
      responseType = 'total';
    } else {
      // デフォルトは全体の損益
      sqlQuery = `
        SELECT 
          '収益' as category,
          SUM(gl.credit_amount) - SUM(gl.debit_amount) as amount
        FROM general_ledger gl
        JOIN account_master am ON gl.account_code = am.account_code
        WHERE gl.report_month = '${reportMonthDate}'
          AND am.account_code >= '800' AND am.account_code < '900'
        UNION ALL
        SELECT 
          '費用' as category,
          SUM(gl.debit_amount) - SUM(gl.credit_amount) as amount
        FROM general_ledger gl
        JOIN account_master am ON gl.account_code = am.account_code
        WHERE gl.report_month = '${reportMonthDate}'
          AND am.account_code >= '400' AND am.account_code < '700'
      `;
      responseType = 'summary';
    }
    
    if (accountCondition && responseType === 'total') {
      sqlQuery = `
        SELECT 
          am.account_name,
          COUNT(*) as transaction_count,
          SUM(gl.debit_amount) as total_debit,
          SUM(gl.credit_amount) as total_credit,
          SUM(gl.debit_amount) - SUM(gl.credit_amount) as net_amount
        FROM general_ledger gl
        JOIN account_master am ON gl.account_code = am.account_code
        WHERE gl.report_month = '${reportMonthDate}'
          AND ${accountCondition}
        GROUP BY am.account_code, am.account_name
        ORDER BY net_amount DESC
      `;
    }
  }
  // ランキングやトップ
  else if (lowerQuestion.includes('ランキング') || lowerQuestion.includes('トップ') || lowerQuestion.includes('上位')) {
    sqlQuery = `
      SELECT 
        am.account_name,
        COUNT(*) as transaction_count,
        SUM(gl.debit_amount) as total_debit,
        SUM(gl.credit_amount) as total_credit,
        CASE 
          WHEN am.account_code >= '800' THEN SUM(gl.credit_amount) - SUM(gl.debit_amount)
          ELSE SUM(gl.debit_amount) - SUM(gl.credit_amount)
        END as amount
      FROM general_ledger gl
      JOIN account_master am ON gl.account_code = am.account_code
      WHERE gl.report_month = '${reportMonthDate}'
        AND gl.description NOT LIKE '%前月繰越%'
        AND gl.description NOT LIKE '%月度計%'
      GROUP BY am.account_code, am.account_name
      HAVING COUNT(*) > 0
      ORDER BY amount DESC
      LIMIT 10
    `;
    responseType = 'ranking';
  }
  // デフォルト：最新の取引を表示
  else {
    sqlQuery = `
      SELECT 
        gl.transaction_date,
        am.account_name,
        gl.counter_account,
        gl.description,
        gl.debit_amount,
        gl.credit_amount,
        gl.balance
      FROM general_ledger gl
      JOIN account_master am ON gl.account_code = am.account_code
      WHERE gl.report_month = '${reportMonthDate}'
      ORDER BY gl.transaction_date DESC, gl.id DESC
      LIMIT 20
    `;
    responseType = 'recent';
  }

  // SQLを実行
  const { data, error } = await supabase.rpc('execute_sql', { 
    query: sqlQuery 
  }).single();

  // RPC関数が存在しない場合は直接クエリ実行
  let queryResult: any[] = [];
  
  if (error && error.message.includes('function')) {
    // 直接クエリを実行
    const result = await executeDirectQuery(sqlQuery);
    queryResult = result;
  } else if (data) {
    queryResult = data;
  }

  // 結果をフォーマット
  return formatQueryResult(queryResult, responseType, question);
}

async function executeDirectQuery(sqlQuery: string) {
  // SQLを解析して適切なSupabaseクエリに変換
  // ここでは基本的なSELECT文のみサポート
  
  if (sqlQuery.includes('UNION')) {
    // UNION句は個別に実行
    const queries = sqlQuery.split('UNION ALL');
    const results = [];
    
    for (const q of queries) {
      const partialResult = await executeSingleQuery(q);
      results.push(...partialResult);
    }
    return results;
  } else {
    return await executeSingleQuery(sqlQuery);
  }
}

async function executeSingleQuery(sql: string) {
  try {
    // 簡易的なSQL解析（実運用では適切なパーサーを使用）
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    const joinMatch = sql.match(/JOIN\s+(\w+)/i);
    const whereMatch = sql.match(/WHERE\s+(.*?)(?:GROUP|ORDER|LIMIT|$)/is);
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    
    if (!fromMatch) return [];
    
    const tableName = fromMatch[1];
    const limit = limitMatch ? parseInt(limitMatch[1]) : 100;
    
    // Supabaseクエリを構築
    let query = supabase.from(tableName).select('*');
    
    if (joinMatch) {
      query = query.select('*, account_master(*)');
    }
    
    query = query.limit(limit);
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Query execution error:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('Query parsing error:', err);
    return [];
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
      response += '日付\t\t摘要\t\t\t\t借方\t\t貸方\n';
      response += '─'.repeat(80) + '\n';
      
      let totalDebit = 0;
      let totalCredit = 0;
      
      data.forEach(row => {
        const date = row.transaction_date ? new Date(row.transaction_date).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) : '';
        const desc = (row.description || '').substring(0, 30).padEnd(30, '　');
        const debit = row.debit_amount || 0;
        const credit = row.credit_amount || 0;
        
        totalDebit += debit;
        totalCredit += credit;
        
        response += `${date}\t${desc}\t${debit.toLocaleString().padStart(10)}\t${credit.toLocaleString().padStart(10)}\n`;
      });
      
      response += '─'.repeat(80) + '\n';
      response += `合計\t\t\t\t\t\t${totalDebit.toLocaleString().padStart(10)}\t${totalCredit.toLocaleString().padStart(10)}\n`;
      response += `\n件数: ${data.length}件`;
      break;
      
    case 'total':
    case 'summary':
      response = `「${question}」の集計結果：\n\n`;
      
      data.forEach(row => {
        const name = row.account_name || row.category || '項目';
        const amount = row.net_amount || row.amount || 0;
        const count = row.transaction_count;
        
        response += `${name}:\n`;
        if (count) response += `  取引件数: ${count}件\n`;
        if (row.total_debit) response += `  借方合計: ${row.total_debit.toLocaleString()}円\n`;
        if (row.total_credit) response += `  貸方合計: ${row.total_credit.toLocaleString()}円\n`;
        response += `  金額: ${amount.toLocaleString()}円\n\n`;
      });
      break;
      
    case 'ranking':
      response = `「${question}」のランキング：\n\n`;
      
      data.forEach((row, index) => {
        const name = row.account_name || '不明';
        const amount = row.amount || 0;
        const count = row.transaction_count || 0;
        
        response += `${index + 1}位. ${name}\n`;
        response += `     金額: ${amount.toLocaleString()}円 (${count}件)\n`;
      });
      break;
      
    case 'recent':
      response = `最新の取引データ：\n\n`;
      response += formatDetailResponse(data);
      break;
      
    default:
      response = JSON.stringify(data, null, 2);
  }
  
  return { response, data };
}

function formatDetailResponse(data: any[]) {
  let response = '日付\t\t勘定科目\t\t摘要\t\t\t借方\t\t貸方\n';
  response += '─'.repeat(80) + '\n';
  
  data.slice(0, 20).forEach(row => {
    const date = row.transaction_date ? new Date(row.transaction_date).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) : '';
    const account = (row.account_name || row.account_master?.account_name || '').substring(0, 10).padEnd(10, '　');
    const desc = (row.description || '').substring(0, 20).padEnd(20, '　');
    const debit = row.debit_amount || 0;
    const credit = row.credit_amount || 0;
    
    response += `${date}\t${account}\t${desc}\t${debit.toLocaleString().padStart(10)}\t${credit.toLocaleString().padStart(10)}\n`;
  });
  
  return response;
}
