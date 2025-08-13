/* /app/api/general-ledger/import/route.ts ver.38
   総勘定元帳 CSV/TXT(Shift-JIS, TSV, 固定幅) インポート API（通常月）
   追加: 自動デバッグ出力 + 原本保存(Supabase Storage)
*/

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DEBUG_IMPORT = process.env.DEBUG_IMPORT === '1'
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
export const runtime = 'nodejs'

// ---------- utils ----------
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
  } catch {}
  return new TextDecoder().decode(new Uint8Array(buf))
}
type Table = string[][]
function splitCSV(text: string): Table {
  const out: string[][] = []; let cur: string[] = []; let field = ''; let q = false
  for (let i=0;i<text.length;i++){
    const c=text[i]
    if(q){ if(c==='"'){ if(text[i+1]==='"'){field+='"'; i++} else q=false } else field+=c }
    else { if(c==='"') q=true
      else if(c===','){ cur.push(field); field='' }
      else if(c==='\n'){ cur.push(field); out.push(cur); cur=[]; field='' }
      else if(c!=='\r'){ field+=c } }
  }
  cur.push(field); out.push(cur)
  while(out.length && out[out.length-1].every(v=>v==='')) out.pop()
  return out
}
function splitTSV(text: string): Table {
  const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.length>0)
  return lines.map(l=>l.split('\t'))
}
function fixedToTSV(text: string): string {
  const lines = text.replace(/\r/g,'').split('\n')
  return lines.map(l=>l.replace(/(?: {2,}|\u3000{1,})/g,'\t')).join('\n')
}
function dedupeHeaders(headers: string[]): string[] {
  const seen=new Map<string,number>()
  return headers.map(h=>{ const b=h.trim(); const n=(seen.get(b)??0)+1; seen.set(b,n); return n===1?b:`${b}_${n}`})
}
function parseInteger(v?: string): number {
  if(!v) return 0
  const s=v.replace(/[,\s＿]/g,''); if(s===''||s==='-') return 0
  const n=Number(s); return Number.isFinite(n)?Math.trunc(n):0
}
function normalizeDateFromString(s: string, fallbackYYYYMM01: string): string|null {
  const t=(s??'').trim(); if(!t) return fallbackYYYYMM01
  if(/^\d{8}$/.test(t)) return `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`
  const m=t.match(/^(\d{4})[\/\-年]?(\d{1,2})[\/\-月]?(\d{1,2})/)
  if(m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`
  return fallbackYYYYMM01
}
function isSummary(joined: string): boolean {
  if(!joined) return true
  if (/[※＊]|\u203B/.test(joined)) return true
  if (joined.includes('月度計') || joined.includes('次月繰越')) return true
  if (joined.includes('総勘定元帳')) return true
  return false
}
const RX = {
  acctLine: /勘定科目コード[^0-9]*([0-9]{2,})/u,
  acctName: /(主科目名|科目名)[^\S\r\n]*[:：]?\s*([^\t ]+)/u,
  isHeaderRow: /(伝票日付|取引日|取引年月日).*(借方|借方金額).*(貸方|貸方金額).*(残高)/u,
}
function splitFlexible(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(s=>s.trim())
  const bySpace = line.split(/ {2,}/).map(s=>s.trim()).filter(s=>s.length>0)
  if (bySpace.length>1) return bySpace
  return line.split(',').map(s=>s.trim())
}

// ---------- parser A: 表形式(列に勘定科目コード) ----------
function tryParseTable(raw: string, reportMonth: string) {
  const tsv = splitTSV(raw)
  const csv = splitCSV(raw)
  const fix = splitTSV(fixedToTSV(raw))
  const cands = [tsv, csv, fix].filter(t=>t && t.length)
  const pick = cands.sort((a,b)=> (Math.max(...b.slice(0,50).map(r=>r.length)) - Math.max(...a.slice(0,50).map(r=>r.length))))[0]
  if(!pick) return null
  const headers = dedupeHeaders(pick[0]); const rows = pick.slice(1)
  const want = {
    account_code: ['勘定科目コード','元帳主科目コード'],
    account_name: ['主科目名','勘定科目名'],
    counter_account: ['主科目名_2','相手科目','相手科目名','相手科目名_2'],
    slip_date: ['伝票日付','取引日','取引年月日'],
    description: ['摘要科目コード_2','摘要','摘要_2','内容','取引内容'],
    debit: ['借方金額','借方'],
    credit:['貸方金額','貸方'],
    balance:['残高'],
  }
  const find=(cands:string[])=>{
    for(const c of cands){ const i=headers.indexOf(c); if(i>=0)return i }
    for(const c of cands){ const i=headers.findIndex(h=>h===c||h.startsWith(`${c}_`)); if(i>=0)return i }
    return -1
  }
  const idx={
    account_code: find(want.account_code),
    account_name: find(want.account_name),
    counter_account: find(want.counter_account),
    slip_date: find(want.slip_date),
    description: find(want.description),
    debit: find(want.debit),
    credit: find(want.credit),
    balance: find(want.balance),
  }
  if(idx.account_code<0 || idx.slip_date<0) return null

  let rowNo=0
  const accountSet = new Map<string,string>()
  const gls:any[] = []
  for(const arr of rows){
    const joined = arr.join('')
    if(isSummary(joined)) continue
    const ac = (arr[idx.account_code]??'').trim(); if(!ac) continue
    const an = idx.account_name>=0 ? (arr[idx.account_name]??'').trim() : ''
    if(an) accountSet.set(ac, an)
    const txDate = normalizeDateFromString(arr[idx.slip_date]??'', reportMonth); if(!txDate) continue
    const debit = idx.debit>=0 ? parseInteger(arr[idx.debit]) : 0
    const credit= idx.credit>=0 ? parseInteger(arr[idx.credit]) : 0
    const bal   = idx.balance>=0? parseInteger(arr[idx.balance]): 0
    const ca    = idx.counter_account>=0 ? (arr[idx.counter_account]??'') : ''
    const desc  = idx.description>=0 ? (arr[idx.description]??'') : ''
    rowNo++
    gls.push({
      report_month: reportMonth, account_code: ac, transaction_date: txDate,
      counter_account: ca, department: null, description: desc,
      debit_amount: debit, credit_amount: credit, balance: bal,
      sheet_no: 1, row_no: rowNo,
    })
  }
  if(gls.length===0) return null
  return { gls, accountSet, headers }
}

// ---------- parser B: ブロック見出し型 ----------
function parseBlockTxt(raw: string, reportMonth: string) {
  const lines = raw.replace(/\r/g,'').split('\n').map(l=>l.trimEnd())
  let currentCode = ''; let currentName = ''
  let inTable = false
  let idxDate=-1, idxDesc=-1, idxDebit=-1, idxCredit=-1, idxBal=-1, idxCA=-1
  let rowNo=0
  const accountSet = new Map<string,string>()
  const gls: any[] = []
  let lastHeaderLine = ''

  const setHeaderFromLine = (line: string) => {
    const cols = splitFlexible(line)
    const find = (keys: string[]) => {
      for (let i=0;i<cols.length;i++){
        const h = cols[i]
        if (keys.some(k=>h.includes(k))) return i
      }
      return -1
    }
    idxDate  = find(['伝票日付','取引日','取引年月日'])
    idxDesc  = find(['摘要','内容','取引内容'])
    idxDebit = find(['借方金額','借方'])
    idxCredit= find(['貸方金額','貸方'])
    idxBal   = find(['残高'])
    idxCA    = find(['相手科目','相手科目名'])
    inTable = (idxDate>=0 && (idxDebit>=0 || idxCredit>=0) && idxBal>=0)
    lastHeaderLine = line
  }

  for (let i=0;i<lines.length;i++){
    const line = lines[i]?.trim() ?? ''
    if (!line) continue

    const mCode = line.match(RX.acctLine)
    if (mCode) {
      currentCode = mCode[1]
      const mName = line.match(RX.acctName) || lines[i+1]?.match(RX.acctName) || null
      currentName = mName ? mName[2] : currentName
      if (currentCode && currentName) accountSet.set(currentCode, currentName)
      inTable = false
      continue
    }
    if (RX.isHeaderRow.test(line)) { setHeaderFromLine(line); continue }

    if (inTable && currentCode) {
      const j = line.replace(/\s/g,'')
      if (!j || j.includes('勘定科目コード')) { inTable=false; continue }
      if (isSummary(j)) continue

      const cols = splitFlexible(line)
      const txDate = normalizeDateFromString(cols[idxDate]??'', reportMonth); if(!txDate) continue
      const debit  = idxDebit>=0 ? parseInteger(cols[idxDebit]) : 0
      const credit = idxCredit>=0? parseInteger(cols[idxCredit]): 0
      const bal    = idxBal>=0   ? parseInteger(cols[idxBal])   : 0
      const ca     = idxCA>=0    ? (cols[idxCA]??'') : ''
      const desc   = idxDesc>=0  ? (cols[idxDesc]??'') : ''

      rowNo++
      gls.push({
        report_month: reportMonth, account_code: currentCode, transaction_date: txDate,
        counter_account: ca, department: null, description: desc,
        debit_amount: debit, credit_amount: credit, balance: bal,
        sheet_no: 1, row_no: rowNo,
      })
    }
  }
  return { gls, accountSet, lastHeaderLine }
}

// ---------- handler ----------
export async function POST(req: NextRequest) {
  const debug:any = { stage: 'start' }
  try {
    const form = await req.formData()
    const year = Number(form.get('year'))
    const month = Number(form.get('month'))
    const file = form.get('file') as File | null
    if (!year || !month || !file) {
      return NextResponse.json({ ok:false, message:'year, month, file は必須です' }, { status:400 })
    }
    const reportMonth = toReportMonth(year, month)
    debug.reportMonth = reportMonth
    debug.filename = (file as any)?.name

    // 原本保存（debug-imports）
    const buf = await file.arrayBuffer()
    try {
      await supabase.storage.createBucket('debug-imports', { public: false })
      // 既存ならエラーになるが無視
    } catch {}
    const stamp = new Date().toISOString().replace(/[:.]/g,'-')
    const path = `${reportMonth}/${stamp}_${debug.filename || 'upload'}`
    await supabase.storage.from('debug-imports').upload(path, new Uint8Array(buf), { upsert: true })
    debug.saved = path

    const raw = decodeBufferByExt(buf, debug.filename || '')

    // 先頭プレビュー
    debug.preview = raw.replace(/\r/g,'').split('\n').slice(0, 20)

    // 解析
    let parsed = tryParseTable(raw, reportMonth)
    debug.tableHeaders = parsed?.headers
    if (!parsed) {
      const block = parseBlockTxt(raw, reportMonth)
      parsed = block
      debug.blockHeader = block.lastHeaderLine
    }
    debug.parsedCount = parsed?.gls?.length || 0
    debug.accounts = parsed?.accountSet ? Array.from(parsed.accountSet.keys()).slice(0,10) : []

    if (!parsed || parsed.gls.length === 0) {
      console.log('IMPORT_DEBUG', JSON.stringify(debug))
      const message = `取引データ0件。先頭プレビュー=${debug.preview.join(' / ')}`
      return NextResponse.json({ ok:false, message, debug: DEBUG_IMPORT ? debug : undefined }, { status:400 })
    }

    const { gls, accountSet } = parsed

    // account_master upsert
    if (accountSet.size) {
      const payload = Array.from(accountSet.entries()).map(([code, name]) => ({
        account_code: code, account_name: name || '（名称未設定）', account_type:'未分類', is_active: true
      }))
      for (let i=0;i<payload.length;i+=100) {
        const chunk = payload.slice(i,i+100)
        const { error } = await supabase.from('account_master').upsert(chunk, { onConflict:'account_code' })
        if (error) {
          console.log('IMPORT_DEBUG', JSON.stringify({ ...debug, stage:'upsert_error', error: error.message }))
          return NextResponse.json({ ok:false, message:`account_master upsert失敗: ${error.message}`, debug: DEBUG_IMPORT ? debug : undefined }, { status:500 })
        }
      }
    }

    // delete old
    {
      const { data: r1, error: e1 } = await supabase.rpc('http_delete_gl_by_month', { p_month: reportMonth })
      if (e1 || r1 == null) {
        const { error: e2 } = await supabase.from('general_ledger').delete().eq('report_month', reportMonth)
        if (e2) {
          console.log('IMPORT_DEBUG', JSON.stringify({ ...debug, stage:'delete_error', error: e2.message }))
          return NextResponse.json({ ok:false, message:`既存データ削除に失敗: ${e2.message}`, debug: DEBUG_IMPORT ? debug : undefined }, { status:500 })
        }
      }
    }

    // insert
    for (let i=0;i<gls.length;i+=500) {
      const chunk = gls.slice(i,i+500)
      const { error } = await supabase.from('general_ledger').insert(chunk)
      if (error) {
        console.log('IMPORT_DEBUG', JSON.stringify({ ...debug, stage:'insert_error', error: error.message, batch:i }))
        return NextResponse.json({ ok:false, message:`general_ledger 登録失敗: ${error.message}`, debug: DEBUG_IMPORT ? debug : undefined }, { status:500 })
      }
    }

    // monthly balance
    await supabase.rpc('update_monthly_balance', { target_month: reportMonth as any }).catch((e:any)=>{
      console.log('IMPORT_DEBUG', JSON.stringify({ ...debug, stage:'rpc_warn', warn: e?.message }))
    })

    console.log('IMPORT_DEBUG', JSON.stringify({ ...debug, stage:'done', inserted: gls.length }))
    return NextResponse.json({
      ok: true,
      reportMonth,
      inserted: gls.length,
      accountsUpserted: accountSet.size,
      debug: DEBUG_IMPORT ? debug : undefined
    })
  } catch (e:any) {
    console.log('IMPORT_DEBUG', JSON.stringify({ error: e?.message }))
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
