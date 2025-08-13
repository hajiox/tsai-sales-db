/* /app/api/general-ledger/import/route.ts ver.34
   財務分析システム：総勘定元帳 CSV/TXT インポート API（通常月用）
   仕様ソース：引き継ぎメモ⑫・DBファイル構成⑫
   - 入力: multipart/form-data { year:number, month:number(1-12), file: csv|txt(Shift-JIS可) }
   - 機能:
     1) report_month を YYYY-MM-01 に正規化
     2) CSV/TXT(Shift-JIS) を独自パーサで読込（重複ヘッダー番号付与）
     3) 勘定科目ブロック構造に対応（コード継承）
     4) account_master を UPSERT
     5) 対象月 general_ledger を削除（0件でも成功扱い）
     6) general_ledger を 500件バッチで INSERT
     7) public.update_monthly_balance(:report_month) を呼び出し（月次残高更新）
   - 返却: { ok: true, reportMonth, deleted, inserted, accountsUpserted }
   注意:
     * 決算月（13月）専用CSVは対象外。必要なら別エンドポイントで実装。
     * ライブラリ(csv-parse等)は使用しない。
*/

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ---------------------- 環境変数 ----------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Supabase 環境変数が未設定です。NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
}

// Service Role クライアント（RLS回避）
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ---------------------- ユーティリティ ----------------------
function toReportMonth(year: number, month: number): string {
  // YYYY-MM-01 文字列
  const mm = String(month).padStart(2, '0')
  return `${year}-${mm}-01`
}

function normalizeDateFromString(s: string, fallbackYYYYMM01: string): string | null {
  // "YYYY/MM/DD", "YYYY-MM-DD", "YYYYMMDD" に素朴対応
  const t = s.trim()
  if (!t) return null
  // 数字のみ 8桁
  if (/^\d{8}$/.test(t)) {
    const y = t.slice(0, 4)
    const m = t.slice(4, 6)
    const d = t.slice(6, 8)
    return `${y}-${m}-${d}`
  }
  // 区切りあり
  const m1 = t.match(/^(\d{4})[\/\-年]?(\d{1,2})[\/\-月]?(\d{1,2})/)
  if (m1) {
    const y = m1[1]
    const m = String(Number(m1[2])).padStart(2, '0')
    const d = String(Number(m1[3])).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // どうしても取れなければ対象月の1日を返す（前月繰越等で日付空の行は後でスキップする）
  return fallbackYYYYMM01
}

function parseInteger(jpNumber: string | undefined): number {
  if (!jpNumber) return 0
  const s = jpNumber.replace(/[,＿\s]/g, '')
  if (s === '' || s === '-') return 0
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function isSummaryOrSkipRow(row: Record<string, string>): boolean {
  // 集計行やスキップ行のヒューリスティック
  const joined = Object.values(row).join('')
  if (!joined) return true
  if (/[※＊]|\u203B/.test(joined)) return true // ※印
  if (joined.includes('月度計') || joined.includes('次月繰越')) return true
  if (joined.includes('総勘定元帳')) return true
  return false
}

// ---- CSV独自パーサ（RFCに厳密ではないが実務CSVに十分） ----
function splitCSV(text: string): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        cur.push(field)
        field = ''
      } else if (c === '\n') {
        cur.push(field)
        out.push(cur)
        cur = []
        field = ''
      } else if (c === '\r') {
        // ignore
      } else {
        field += c
      }
    }
  }
  // 末尾
  cur.push(field)
  out.push(cur)
  // 末尾空行除去
  while (out.length && out[out.length - 1].every(v => v === '')) out.pop()
  return out
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map(h => {
    const base = h.trim()
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}_${count}`
  })
}

// Shift-JIS判定（拡張子でのみ判定）
function decodeBufferByExt(buf: ArrayBuffer, filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.txt')) {
    try {
      // @ts-ignore
      return new TextDecoder('shift_jis').decode(new Uint8Array(buf))
    } catch {
      return new TextDecoder().decode(new Uint8Array(buf))
    }
  }
  // CSV はまず UTF-8 で試す
  return new TextDecoder().decode(new Uint8Array(buf))
}

// ---------------------- 主要処理 ----------------------
export const runtime = 'nodejs' // Edge では TextDecoder('shift_jis') が不安定なため nodejs を明示

export async function POST(req: NextRequest) {
  try {
    // 1) 受信
    const form = await req.formData()
    const year = Number(form.get('year'))
    const month = Number(form.get('month'))
    const file = form.get('file') as File | null

    if (!year || !month || !file) {
      return NextResponse.json({ ok: false, message: 'year, month, file は必須です' }, { status: 400 })
    }
    const reportMonth = toReportMonth(year, month)

    // 2) 読み込み & パース
    const buf = await file.arrayBuffer()
    const raw = decodeBufferByExt(buf, file.name)
    const rows = splitCSV(raw)
    if (!rows.length) {
      return NextResponse.json({ ok: false, message: 'CSVにデータがありません' }, { status: 400 })
    }

    // 3) ヘッダー整形
    let headerRow = rows[0]
    // 一部の会計CSVは1行目がヘッダー、2行目がタイトル「総勘定元帳」のため、2行目以降がデータ
    const headers = dedupeHeaders(headerRow)
    const dataRows = rows.slice(1)

    // 欲しいカラムの候補名
    const COL = {
      account_code: ['勘定科目コード', '元帳主科目コード'],
      account_name: ['主科目名'],
      counter_account: ['主科目名_2', '相手科目', '相手科目名', '相手科目名_2'],
      slip_date: ['伝票日付', '取引日', '取引年月日'],
      description: ['摘要科目コード_2', '摘要', '摘要_2', '内容'],
      debit: ['借方金額'],
      credit: ['貸方金額'],
      balance: ['残高'],
    }

    const findCol = (cands: string[]) => {
      for (const c of cands) {
        const idx = headers.indexOf(c)
        if (idx >= 0) return idx
      }
      // 重複付与パターンの自動探索（_2, _3…）
      for (const c of cands) {
        const idx = headers.findIndex(h => h === c || h.startsWith(`${c}_`))
        if (idx >= 0) return idx
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

    // 4) 行変換（ブロック継承）
    const fallbackDate = reportMonth // 'YYYY-MM-01'
    let currentAccountCode = ''
    let sheetNo = 1
    let rowNo = 0

    type GL = {
      account_code: string
      account_name: string
      transaction_date: string
      counter_account: string
      description: string
      debit_amount: number
      credit_amount: number
      balance: number
      sheet_no: number
      row_no: number
    }

    const gls: GL[] = []
    const accountSet = new Map<string, string>() // code -> name

    for (const arr of dataRows) {
      // 配列→連想
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => (obj[h] = (arr[i] ?? '').trim()))

      // 勘定科目コードが現れたら更新（ブロック開始）
      const ac = idx.account_code >= 0 ? (obj[headers[idx.account_code]] ?? '').trim() : ''
      const an = idx.account_name >= 0 ? (obj[headers[idx.account_name]] ?? '').trim() : ''
      if (ac) {
        currentAccountCode = ac
        if (an) accountSet.set(ac, an)
      }

      // スキップ判定
      if (!currentAccountCode) continue
      if (isSummaryOrSkipRow(obj)) continue

      // 取引日
      const rawDate = idx.slip_date >= 0 ? obj[headers[idx.slip_date]] : ''
      const txDate = normalizeDateFromString(rawDate, fallbackDate)
      if (!txDate) continue // 日付不明はスキップ

      // 金額・テキスト
      const debit = idx.debit >= 0 ? parseInteger(obj[headers[idx.debit]]) : 0
      const credit = idx.credit >= 0 ? parseInteger(obj[headers[idx.credit]]) : 0
      const bal = idx.balance >= 0 ? parseInteger(obj[headers[idx.balance]]) : 0
      const ca = idx.counter_account >= 0 ? (obj[headers[idx.counter_account]] ?? '') : ''
      const desc = idx.description >= 0 ? (obj[headers[idx.description]] ?? '') : ''

      rowNo += 1
      gls.push({
        account_code: currentAccountCode,
        account_name: accountSet.get(currentAccountCode) ?? '',
        transaction_date: txDate,
        counter_account: ca,
        description: desc,
        debit_amount: debit,
        credit_amount: credit,
        balance: bal,
        sheet_no: sheetNo,
        row_no: rowNo,
      })
    }

    // データ無しは異常
    if (gls.length === 0) {
      return NextResponse.json({ ok: false, message: '取引データが0件でした（ヘッダー不一致or集計行のみ）' }, { status: 400 })
    }

    // 5) DB 操作
    // 5-1) 勘定科目マスタ UPSERT
    if (accountSet.size) {
      const upserts = Array.from(accountSet.entries()).map(([code, name]) => ({
        account_code: code,
        account_name: name || '（名称未設定）',
        account_type: '未分類',
        is_active: true,
      }))
      // 100件ずつ
      for (let i = 0; i < upserts.length; i += 100) {
        const chunk = upserts.slice(i, i + 100)
        const { error } = await supabase
          .from('account_master')
          .upsert(chunk, { onConflict: 'account_code' })
        if (error) {
          return NextResponse.json({ ok: false, message: `account_master upsert で失敗: ${error.message}` }, { status: 500 })
        }
      }
    }

    // 5-2) 既存データ削除（0件でも成功扱い）
    {
      const { data: delCountRes, error: delErr } = await supabase
        .rpc('http_delete_gl_by_month', { p_month: reportMonth })
      // ↑ もし http_delete_gl_by_month が未実装なら通常DELETEを実行
      if (delErr || delCountRes == null) {
        const { data: delRes, error: delErr2 } = await supabase
          .from('general_ledger')
          .delete()
          .eq('report_month', reportMonth)
          .select('id', { count: 'exact', head: true })
        if (delErr2) {
          return NextResponse.json({ ok: false, message: `既存データ削除に失敗: ${delErr2.message}` }, { status: 500 })
        }
      }
    }

    // 5-3) general_ledger INSERT（500件バッチ）
    const glPayload = gls.map((g) => ({
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

    let inserted = 0
    for (let i = 0; i < glPayload.length; i += 500) {
      const chunk = glPayload.slice(i, i + 500)
      const { error } = await supabase.from('general_ledger').insert(chunk)
      if (error) {
        return NextResponse.json({ ok: false, message: `general_ledger 登録で失敗: ${error.message}` }, { status: 500 })
      }
      inserted += chunk.length
    }

    // 5-4) 月次残高更新 RPC（存在する関数名で実行）
    {
      // update_monthly_balance(target_month date)
      const { error: rpcErr } = await supabase.rpc('update_monthly_balance', { target_month: reportMonth as any })
      if (rpcErr) {
        // ここで失敗しても取込自体は成功。メッセージのみ返す。
        console.warn('update_monthly_balance で失敗:', rpcErr.message)
      }
    }

    return NextResponse.json({
      ok: true,
      reportMonth,
      deleted: 'ok', // 0件でも成功扱い
      inserted,
      accountsUpserted: accountSet.size,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, message: e?.message ?? 'Internal Server Error' }, { status: 500 })
  }
}

// ---------------------- 参考：削除用RPC（任意・DB側で用意可） ----------------------
/*
-- Supabase SQL Editor で作ると DELETE が高速・権限明確
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
