/* /app/api/general-ledger/import/route.ts ver.36
   総勘定元帳 CSV/TXT(Shift-JIS, TSV, 固定幅スペース) インポート API（通常月）
   強化点:
     - ヘッダー自動検出（先頭20行を走査）
     - 区切り自動判定: CSV / TSV / 固定幅スペース→TSV化
     - 解析失敗時にヘッダー候補をレスポンスに含める（400）
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
      // @ts-ignore
      return new TextDecoder('shift_jis').decode(new Uint8Array(buf))
    }
  } catch { /* fallthrough */ }
  return new TextDecoder().decode(new Uint8Array(buf))
}

type Table = string[][]

function splitCSV(text: string): Table {
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

function splitTSV(text: string): Table {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length > 0)
  return lines.map(l => l.split('\t'))
}

// 固定幅（連続スペース）→ タブ化してTSV扱い
function toTSVFromFixed(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n')
  // 2つ以上の半角スペース（または全角スペース群）をタブに
  return lines.map(l => l.replace(/(?: {2,}|\u3000{1,})/g, '\t')).join('\n')
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
  const s = v.replace(/[,\s＿]/g, '')
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

function isSummaryOrSkipRow(joined: string): boolean {
  if (!joined) return true
  if (/[※＊]|\u203B/.test(joined)) return true
  if (joined.includes('月度計') || joined.includes('次月繰越')) return true
  if (joined.includes('総勘定元帳')) return true
  return false
}

// 先頭〜20行でヘッダー候補を探す
function findHeaderRowIndex(table: Table): number {
  const must1 = ['勘定科目コード', '元帳主科目コード']
  const must2 = ['伝票日付','取引日','取引年月日']
  const maxScan = Math.min(20, table.length)
  for (let r = 0; r < maxScan; r++) {
    const row = table[r].map(s => (s ?? '').trim())
    const joined = row.join('')
    if (!joined) continue
    const has1 = row.some(c => must1.includes(c))
    const has2 = row.some(c => must2.includes(c))
    if (has1 && has2) return r
  }
  return -1
}

// 一番「列数が多い」テーブルを選ぶ簡易評価
function pickBestTable(cands: Table[]): Table | null {
  const scored = cands
    .filter(Boolean)
    .map(t => ({ t, width: t.length ? Math.max(...t.slice(0, 50).map(r => r.length)) : 0 }))
  scored.sort((a,b) => b.width - a.width)
  return scored[0]?.t ?? null
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

    // 読み込み→複数パーサーで候補作成
    const buf = await file.arrayBuffer()
    const raw = decodeBufferByExt(buf, file.name)
    const tsvFromFixed = toTSVFromFixed(raw)
    const candCSV  = splitCSV(raw)
    const candTSV  = splitTSV(raw)
    const candFIX  = splitTSV(tsvFromFixed)
    const table = pickBestTable([candTSV, candCSV, candFIX])
    if (!table || !table.length) {
      return NextResponse.json({ ok:false, message:'ファイル解析に失敗（CSV/TSV/固定幅）' }, { status:400 })
    }

    // ヘッダー行の自動検出
    const hdrIdx = findHeaderRowIndex(table)
    const headersRaw = hdrIdx >= 0 ? table[hdrIdx] : table[0]
    const headers = dedupeHeaders(headersRaw)
    const dataRows = table.slice(hdrIdx >= 0 ? hdrIdx + 1 : 1)

    const COL = {
      account_code: ['勘定科目コード','元帳主科目コード'],
      account_name: ['主科目名'],
      counter_account: ['主科目名_2','相手科目','相手科目名','相手科目名_2'],
      slip_date: ['伝票日付','取引日','取引年月日'],
      description: ['摘要科目コード_2','摘要','摘要_2','内容','取引内容'],
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
        message:`ヘッダーが想定外です。検出ヘッダー: ${headers.join(' | ')} / 期待: 勘定科目コード, 伝票日付 など`
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
      const row = arr.map(s => (s ?? '').trim())
      const joined = row.join('')
      if (isSummaryOrSkipRow(joined)) continue

      const ac = (row[idx.account_code] ?? '').trim()
      const an = idx.account_name >= 0 ? (row[idx.account_name] ?? '').trim() : ''
      if (ac) { currentAccountCode = ac; if (an) accountSet.set(ac, an) }
      if (!currentAccountCode) continue

      const rawDate = idx.slip_date >= 0 ? (row[idx.slip_date] ?? '') : ''
      const txDate = normalizeDateFromString(rawDate, fallbackDate)
      if (!txDate) continue

      const debit  = idx.debit  >= 0 ? parseInteger(row[idx.debit])  : 0
      const credit = idx.credit >= 0 ? parseInteger(row[idx.credit]) : 0
      const bal    = idx.balance>= 0 ? parseInteger(row[idx.balance]): 0
      const ca     = idx.counter_account>=0 ? (row[idx.counter_account] ?? '') : ''
      const desc   = idx.description>=0 ? (row[idx.description] ?? '') : ''

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
        message:`取引データが0件。ヘッダー=${headers.join(' | ')}（固定幅の可能性も吸収済み）`
      }, { status:400 })
    }

    // ===== account_master upsert =====
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

    // ===== delete old (0件でも成功扱い) =====
    {
      const { data: r1, error: e1 } = await supabase.rpc('http_delete_gl_by_month', { p_month: reportMonth })
      if (e1 || r1 == null) {
        const { error: e2 } = await supabase.from('general_ledger').delete().eq('report_month', reportMonth)
        if (e2) return NextResponse.json({ ok:false, message:`既存データ削除に失敗: ${e2.message}` }, { status:500 })
      }
    }

    // ===== insert general_ledger =====
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

    // ===== monthly balance update =====
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
-- 任意: 高速削除RPC
create or replace function public.http_delete_gl_by_month(p_month date)
returns integer language sql as $$
  with del as (
    delete from public.general_ledger
    where report_month = date_trunc('month', p_month)::date
    returning 1
  )
  select count(*) from del;
$$;
*/
