/* /app/api/general-ledger/import/route.ts ver.35
   総勘定元帳 CSV/TXT(Shift-JIS, TSV) インポート API（通常月）
   変更点: CSV/TSV 自動判定を追加（TXT=TSV想定）
*/

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Supabase 環境変数が未設定です。NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

export const runtime = 'nodejs'

// ========== utils ==========
function toReportMonth(year: number, month: number): string {
  const mm = String(month).padStart(2, '0')
  return `${year}-${mm}-01`
}

function decodeBufferByExt(buf: ArrayBuffer, filename: string): string {
  const lower = filename.toLowerCase()
  try {
    if (lower.endsWith('.txt')) {
      // 会計ソフトTXTは概ねShift-JIS
      // @ts-ignore
      return new TextDecoder('shift_jis').decode(new Uint8Array(buf))
    }
  } catch { /* fallthrough */ }
  return new TextDecoder().decode(new Uint8Array(buf))
}

type Table = string[][]

function detectDelimiter(firstNonEmptyLine: string): 'csv'|'tsv' {
  const comma = (firstNonEmptyLine.match(/,/g) ?? []).length
  const tab = (firstNonEmptyLine.match(/\t/g) ?? []).length
  return tab > comma ? 'tsv' : 'csv'
}

function splitTable(text: string, mode: 'csv'|'tsv'): Table {
  if (mode === 'tsv') {
    // TSVは引用符のエスケープが稀なため単純分割で十分
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length > 0)
    return lines.map(l => l.split('\t'))
  }
  // CSV: 簡易クォート対応
  const out: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n') { cur.push(field); out.push(cur); cur = []; field = '' }
      else if (c === '\r') { /* ignore */ }
      else field += c
    }
  }
  cur.push(field); out.push(cur)
  while (out.length && out[out.length - 1].every(v => v === '')) out.pop()
  return out
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map(h => {
    const base = h.trim()
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}_${n}`
  })
}

function parseInteger(v?: string): number {
  if (!v) return 0
  const s = v.replace(/[,＿\s]/g, '')
  if (s === '' || s === '-') return 0
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function normalizeDateFromString(s: string, fallbackYYYYMM01: string): string | null {
  const t = (s ?? '').trim()
  if (!t) return null
  if (/^\d{8}$/.test(t)) return `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`
  const m = t.match(/^(\d{4})[\/\-年]?(\d{1,2})[\/\-月]?(\d{1,2})/)
  if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`
  return fallbackYYYYMM01
}

function isSummaryOrSkipRow(rowJoined: string): boolean {
  if (!rowJoined) return true
  if (/[※＊]|\u203B/.test(rowJoined)) return true
  if (rowJoined.includes('月度計') || rowJoined.includes('次月繰越')) return true
  if (rowJoined.includes('総勘定元帳')) return true
  return false
}

// ========== handler ==========
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const year = Number(form.get('year'))
    const month = Number(form.get('month'))
    const file = form.get('file') as File | null
    if (!year || !month || !file) {
      return NextResponse.json({ ok:false, message:'year, month, file は必須です' }, { status:400 })
    }
    const reportMonth = toReportMonth(year, month)

    const buf = await file.arrayBuffer()
    const text = decodeBufferByExt(buf, file.name)
    const firstLine = (text.split(/\r?\n/).find(l => l.trim().length > 0) ?? '')
    const mode = detectDelimiter(firstLine) // csv or tsv
    const table = splitTable(text, mode)
    if (!table.length) {
      return NextResponse.json({ ok:false, message:'ファイルが空です（CSV/TSV）' }, { status:400 })
    }

    // 1行目をヘッダー、2行目にタイトル「総勘定元帳」が来ることがある
    const headers = dedupeHeaders(table[0])
    const dataRows = table.slice(1)

    const COL = {
      account_code: ['勘定科目コード','元帳主科目コード'],
      account_name: ['主科目名'],
      counter_account: ['主科目名_2','相手科目','相手科目名','相手科目名_2'],
      slip_date: ['伝票日付','取引日','取引年月日'],
      description: ['摘要科目コード_2','摘要','摘要_2','内容'],
      debit: ['借方金額'],
      credit: ['貸方金額'],
      balance: ['残高'],
    }
    const findCol = (cands: string[]) => {
      for (const c of cands) {
        const i = headers.indexOf(c); if (i >= 0) return i
      }
      for (const c of cands) {
        const i = headers.findIndex(h => h === c || h.startsWith(`${c}_`)); if (i >= 0) return i
      }
      return -1
    }
    const idx = {
      account_code: findCol(COL.account_code),
      account_name: findCol(COL.account_name),
      counter_account: findCol(COL.counter_account),
      slip_date: findCol(COL.slip_date),
      description: findCol(COL.description),
      debit: findCol(COL.debit),
      credit: findCol(COL.credit),
      balance: findCol(COL.balance),
    }

    if (idx.account_code < 0 || idx.slip_date < 0) {
      return NextResponse.json({
        ok:false,
        message:`ヘッダーが想定外です（区切り=${mode}）。最低限必要: 勘定科目コード/伝票日付。検出ヘッダー: ${headers.join(' | ')}`
      }, { status:400 })
    }

    const fallbackDate = reportMonth
    let currentAccountCode = ''
    let rowNo = 0
    type GL = {
      account_code: string; account_name: string; transaction_date: string;
      counter_account: string; description: string; debit_amount: number;
      credit_amount: number; balance: number; sheet_no: number; row_no: number;
    }
    const gls: GL[] = []
    const accountSet = new Map<string,string>()

    for (const arr of dataRows) {
      const joined = arr.join('')
      // 2行目タイトルなどの除外
      if (isSummaryOrSkipRow(joined)) continue

      const ac = (arr[idx.account_code] ?? '').trim()
      const an = idx.account_name >= 0 ? (arr[idx.account_name] ?? '').trim() : ''
      if (ac) { currentAccountCode = ac; if (an) accountSet.set(ac, an) }
      if (!currentAccountCode) continue

      const rawDate = idx.slip_date >= 0 ? (arr[idx.slip_date] ?? '') : ''
      const txDate = normalizeDateFromString(rawDate, fallbackDate)
      if (!txDate) continue

      const debit  = idx.debit  >= 0 ? parseInteger(arr[idx.debit])  : 0
      const credit = idx.credit >= 0 ? parseInteger(arr[idx.credit]) : 0
      const bal    = idx.balance>= 0 ? parseInteger(arr[idx.balance]): 0
      const ca     = idx.counter_account>=0 ? (arr[idx.counter_account] ?? '') : ''
      const desc   = idx.description>=0 ? (arr[idx.description] ?? '') : ''

      rowNo++
      gls.push({
        account_code: currentAccountCode,
        account_name: accountSet.get(currentAccountCode) ?? '',
        transaction_date: txDate,
        counter_account: ca,
        description: desc,
        debit_amount: debit,
        credit_amount: credit,
        balance: bal,
        sheet_no: 1,
        row_no: rowNo,
      })
    }

    if (gls.length === 0) {
      return NextResponse.json({
        ok:false,
        message:`取引データが0件でした。区切り=${mode} / ヘッダー=${headers.join(' | ')}`
      }, { status:400 })
    }

    // ===== DB: account_master upsert =====
    if (accountSet.size) {
      const payload = Array.from(accountSet.entries()).map(([code, name]) => ({
        account_code: code, account_name: name || '（名称未設定）', account_type:'未分類', is_active: true
      }))
      for (let i=0;i<payload.length;i+=100) {
        const chunk = payload.slice(i,i+100)
        const { error } = await supabase.from('account_master').upsert(chunk, { onConflict:'account_code' })
        if (error) return NextResponse.json({ ok:false, message:`account_master upsert失敗: ${error.message}` }, { status:500 })
      }
    }

    // ===== DB: delete old (0件でも成功扱い) =====
    {
      const { data: r1, error: e1 } = await supabase.rpc('http_delete_gl_by_month', { p_month: reportMonth })
      if (e1 || r1 == null) {
        const { error: e2 } = await supabase.from('general_ledger').delete().eq('report_month', reportMonth)
        if (e2) return NextResponse.json({ ok:false, message:`既存データ削除に失敗: ${e2.message}` }, { status:500 })
      }
    }

    // ===== DB: insert general_ledger =====
    const glPayload = gls.map(g => ({
      report_month: reportMonth,
      account_code: g.account_code,
      transaction_date: g.transaction_date,
      counter_account: g.counter_account,
      department: null,
      description: g.description,
      debit_amount: g.debit_amount,
      credit_amount: g.credit_amount,
      balance: g.balance,
      sheet_no: g.sheet_no,
      row_no: g.row_no,
    }))
    for (let i=0;i<glPayload.length;i+=500) {
      const chunk = glPayload.slice(i,i+500)
      const { error } = await supabase.from('general_ledger').insert(chunk)
      if (error) return NextResponse.json({ ok:false, message:`general_ledger 登録失敗: ${error.message}` }, { status:500 })
    }

    // ===== DB: monthly balance update =====
    await supabase.rpc('update_monthly_balance', { target_month: reportMonth as any }).catch(() => {})

    return NextResponse.json({
      ok: true,
      reportMonth,
      inserted: gls.length,
      accountsUpserted: accountSet.size
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok:false, message: e?.message ?? 'Internal Server Error' }, { status:500 })
  }
}

/*
-- 任意: 高速削除用RPC
create or replace function public.http_delete_gl_by_month(p_month date)
returns integer
language sql
as $$
  with del as (
    delete from public.general_ledger
    where report_month = date_trunc('month', p_month)::date
    returning 1
  )
  select count(*) from del;
$$;
*/
