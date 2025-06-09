import type { NextApiRequest, NextApiResponse } from "next"
import { supabase } from "../../lib/supabase"

interface Totals {
  floor: number
  ec: number
}

async function fetchTotals(start: string, end: string): Promise<Totals> {
  const { data, error } = await supabase
    .from("daily_sales_report")
    .select(
      "floor_sales, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount",
    )
    .gte("date", start)
    .lte("date", end)

  if (error || !data) {
    console.error(error)
    return { floor: 0, ec: 0 }
  }

  return (data || []).reduce(
    (acc, row) => {
      acc.floor += row.floor_sales || 0
      acc.ec +=
        (row.amazon_amount || 0) +
        (row.rakuten_amount || 0) +
        (row.yahoo_amount || 0) +
        (row.mercari_amount || 0) +
        (row.base_amount || 0) +
        (row.qoo10_amount || 0)
      return acc
    },
    { floor: 0, ec: 0 },
  )
}

function formatChange(diff: number): string {
  const value = Math.round(diff * 10) / 10
  const sign = diff >= 0 ? "増加" : "減少"
  return `${Math.abs(value)}%${sign}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0]
  const end = new Date(`${dateStr}T00:00:00`)
  const day = end.getDate()
  const year = end.getFullYear()
  const month = end.getMonth()

  const startThis = new Date(year, month, 1)
  const totalsThis = await fetchTotals(startThis.toISOString().split("T")[0], dateStr)

  const prev1Month = month - 1
  const prev1Day = Math.min(day, new Date(year, month, 0).getDate())
  const startPrev1 = new Date(year, prev1Month, 1)
  const endPrev1 = new Date(year, prev1Month, prev1Day)
  const totalsPrev1 = await fetchTotals(
    startPrev1.toISOString().split("T")[0],
    endPrev1.toISOString().split("T")[0],
  )

  const prev2Month = month - 2
  const prev2Day = Math.min(day, new Date(year, month - 1, 0).getDate())
  const startPrev2 = new Date(year, prev2Month, 1)
  const endPrev2 = new Date(year, prev2Month, prev2Day)
  const totalsPrev2 = await fetchTotals(
    startPrev2.toISOString().split("T")[0],
    endPrev2.toISOString().split("T")[0],
  )

  const ecDiff1 = totalsPrev1.ec ? ((totalsThis.ec - totalsPrev1.ec) / totalsPrev1.ec) * 100 : 0
  const ecDiff2 = totalsPrev2.ec ? ((totalsThis.ec - totalsPrev2.ec) / totalsPrev2.ec) * 100 : 0
  const floorDiff1 = totalsPrev1.floor ? ((totalsThis.floor - totalsPrev1.floor) / totalsPrev1.floor) * 100 : 0
  const floorDiff2 = totalsPrev2.floor ? ((totalsThis.floor - totalsPrev2.floor) / totalsPrev2.floor) * 100 : 0

  let floorTrend = ""
  if (Math.abs(floorDiff1) <= 5 && Math.abs(floorDiff2) <= 5) {
    floorTrend = "横ばい"
  } else if (floorDiff1 + floorDiff2 > 0) {
    floorTrend = "増加"
  } else {
    floorTrend = "減少"
  }

  const comment = `${month + 1}月1日〜${day}日のEC売上は${prev1Month + 1}月同期間に比べて${formatChange(ecDiff1)}、${prev2Month + 1}月同期間に比べて${formatChange(ecDiff2)}。店舗売上は${prev1Month + 1}月・${prev2Month + 1}月と比較して${floorTrend}です。`

  res.status(200).send(comment)
}
