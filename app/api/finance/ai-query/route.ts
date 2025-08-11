// /app/api/finance/ai-query/route.ts ver.3
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

    const queryResult = await analyzeAndExecuteQuery(question, reportMonth);
    
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

async function analyzeAndExecuteQuery(question: string, reportMonth: string) {
  const reportMonthDate = `${reportMonth}-01`;
  
  // キーワード抽出と分析
  const keywords = extractKeywords(question);
  console.log('Extracted keywords:', keywords);

  try {
    // まず勘定科目マスタから関連する科目を検索
    const { data: accounts } = await supabase
      .from('account_master')
      .select('account_code, account_name')
      .or(keywords.map(k => `account_name.ilike.%${k}%`).join(','));

    const accountCodes = accounts?.map(a => a.account_code) || [];
    const accountNames = accounts?.map(a => a.account_name) || [];

    // 総勘定元帳から検索
    let query = supabase
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
      .eq('report_month', reportMonthDate);

    // 検索条件を構築
    const orConditions = [];
    
    // 勘定科目コードでの検索
    if (accountCodes.length > 0) {
      orConditions.push(`account_code.in.(${accountCodes.join(',')})`);
    }
    
    // キーワードでの検索（摘要、相手科目）
    keywords.forEach(keyword => {
      orConditions.push(`description.ilike.%${keyword}%`);
      orConditions.push(`counter_account.ilike.%${keyword}%`);
    });
    
    // 勘定科目名での検索
    accountNames.forEach(name => {
      orConditions.push(`counter_account.ilike.%${name}%`);
    });

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','));
    }

    query = query.order('transaction_date');

    const { data, error } = await query;

    if (error) {
      console.error('Query error:', error);
      throw error;
    }

    // 集計が必要かどうか判定
    const needsAggregation = question.includes('合計') || 
                            question.includes('総額') || 
                            question.includes('いくら');

    if (needsAggregation && data && data.length > 0) {
      return formatAggregatedResult(data, question, keywords);
    } else {
      return formatDetailResult(data || [], question, keywords);
    }

  } catch (error) {
    console.error('Query execution error:', error);
    return {
      response: 'データの取得中にエラーが発生しました。',
      data: []
    };
  }
}

function extractKeywords(question: string): string[] {
  const keywords = [];
  
  // 一般的な勘定科目のキーワード
  const commonKeywords = {
    '食材': ['食材', '食品', '肉', '野菜', '米', '魚', '調味'],
    '食費': ['食費', '食材', '食品', '弁当'],
    '電気': ['電気', '電力', '東北電力', '電灯'],
    '水道': ['水道', '水道光熱'],
    '広告': ['広告', 'メルカリ', 'プロモーション', '宣伝'],
    '通信': ['通信', '電話', 'インターネット', '携帯', 'ドコモ', 'ソフトバンク'],
    '家賃': ['家賃', '賃料', '賃貸'],
    '給与': ['給与', '給料', '賃金', '給'],
    '仕入': ['仕入', '商品', '材料'],
    '売上': ['売上', '販売', 'EC'],
    '交通': ['交通', 'ガソリン', '高速', 'ETC', '電車'],
    '保険': ['保険', '社会保険', '健康保険', '年金'],
    '消耗': ['消耗', '事務用品', '文具'],
    '光熱': ['光熱', '電気', 'ガス', '水道'],
    'ガス': ['ガス', 'プロパン', '都市ガス']
  };

  // 質問から該当するキーワードを抽出
  for (const [key, values] of Object.entries(commonKeywords)) {
    if (question.includes(key)) {
      keywords.push(...values);
    }
  }

  // 質問に含まれる具体的な単語も追加（2文字以上）
  const words = question.match(/[ァ-ヾ一-龠]{2,}/g) || [];
  words.forEach(word => {
    if (!keywords.includes(word) && word.length >= 2) {
      // 除外する一般的な単語
      const excludeWords = ['今月', '先月', '合計', '総額', 'いくら', '詳細', '教えて', 'ください', '出して'];
      if (!excludeWords.includes(word)) {
        keywords.push(word);
      }
    }
  });

  // 重複を除去
  return [...new Set(keywords)];
}

function formatDetailResult(data: any[], question: string, keywords: string[]): any {
  if (!data || data.length === 0) {
    return {
      response: `「${question}」に該当するデータが見つかりませんでした。\n検索キーワード: ${keywords.join(', ')}`,
      data: []
    };
  }

  let response = `「${question}」の検索結果：\n\n`;
  response += `日付\t\t勘定科目\t\t摘要\t\t\t\t\t借方\t\t貸方\n`;
  response += '─'.repeat(80) + '\n';
  
  let totalDebit = 0;
  let totalCredit = 0;
  
  data.forEach(row => {
    const date = row.transaction_date ? 
      new Date(row.transaction_date).toLocaleDateString('ja-JP', { 
        month: '2-digit', 
        day: '2-digit' 
      }) : '';
    
    const accountName = (row.account_master?.account_name || '').substring(0, 12).padEnd(12, ' ');
    
    let desc = (row.description || '').replace(/\s+/g, ' ');
    if (desc.length > 30) {
      desc = desc.substring(0, 27) + '...';
    }
    desc = desc.padEnd(30, ' ');
    
    const debit = row.debit_amount || 0;
    const credit = row.credit_amount || 0;
    
    totalDebit += debit;
    totalCredit += credit;
    
    response += `${date}\t${accountName}\t${desc}\t${debit.toLocaleString().padStart(10)}\t${credit.toLocaleString().padStart(10)}\n`;
  });
  
  response += '─'.repeat(80) + '\n';
  response += `合計\t\t\t\t\t\t\t\t${totalDebit.toLocaleString().padStart(10)}\t${totalCredit.toLocaleString().padStart(10)}\n`;
  response += `\n件数: ${data.length}件`;
  response += `\n検索キーワード: ${keywords.join(', ')}`;
  
  return { response, data };
}

function formatAggregatedResult(data: any[], question: string, keywords: string[]): any {
  // 勘定科目ごとに集計
  const summary = new Map();
  
  data.forEach(item => {
    const key = `${item.account_code}_${item.account_master?.account_name || ''}`;
    if (!summary.has(key)) {
      summary.set(key, {
        code: item.account_code,
        name: item.account_master?.account_name || '不明',
        debit: 0,
        credit: 0,
        count: 0,
        items: []
      });
    }
    const s = summary.get(key);
    s.debit += item.debit_amount || 0;
    s.credit += item.credit_amount || 0;
    s.count += 1;
    s.items.push({
      date: item.transaction_date,
      description: item.description,
      debit: item.debit_amount,
      credit: item.credit_amount
    });
  });

  let response = `「${question}」の集計結果：\n\n`;
  
  let grandTotalDebit = 0;
  let grandTotalCredit = 0;
  let grandTotalCount = 0;
  
  Array.from(summary.values()).forEach(item => {
    response += `【${item.name}】(${item.code})\n`;
    response += `  取引件数: ${item.count}件\n`;
    response += `  借方合計: ${item.debit.toLocaleString()}円\n`;
    response += `  貸方合計: ${item.credit.toLocaleString()}円\n`;
    
    // 主な取引を3件表示
    response += `  主な取引:\n`;
    item.items.slice(0, 3).forEach((trans: any) => {
      const date = new Date(trans.date).toLocaleDateString('ja-JP', { 
        month: 'numeric', 
        day: 'numeric' 
      });
      const amount = trans.debit || trans.credit;
      const desc = (trans.description || '').substring(0, 20);
      response += `    ${date} ${desc} ${amount.toLocaleString()}円\n`;
    });
    response += '\n';
    
    grandTotalDebit += item.debit;
    grandTotalCredit += item.credit;
    grandTotalCount += item.count;
  });
  
  response += '─'.repeat(40) + '\n';
  response += `【総合計】\n`;
  response += `  対象勘定科目数: ${summary.size}科目\n`;
  response += `  総取引件数: ${grandTotalCount}件\n`;
  response += `  借方総額: ${grandTotalDebit.toLocaleString()}円\n`;
  response += `  貸方総額: ${grandTotalCredit.toLocaleString()}円\n`;
  response += `\n検索キーワード: ${keywords.join(', ')}`;
  
  return { response, data };
}
