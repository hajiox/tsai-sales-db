import type { NextApiRequest, NextApiResponse } from "next"
import { supabase } from "../../lib/supabase"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP").format(amount) + "円"
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0]
  try {
    const { data: dayData, error: dayError } = await supabase
      .from("daily_sales_report")
      .select("*")
      .eq("date", dateStr)
      .single()

    if (dayError || !dayData) {
      console.error(dayError)
      return res.status(404).send("Not Found")
    }

    const start = new Date(`${dateStr}T00:00:00`)
    start.setDate(1)
    const startStr = start.toISOString().split("T")[0]

    const { data: monthRows, error: monthError } = await supabase
      .from("daily_sales_report")
      .select(
        "floor_sales, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount"
      )
      .gte("date", startStr)
      .lte("date", dateStr)

    if (monthError || !monthRows) {
      console.error(monthError)
      return res.status(500).send("Failed to fetch data")
    }

    const totals = monthRows.reduce(
      (acc, row) => {
        acc.floor += row.floor_sales || 0
        acc.ec +=
          (row.amazon_amount || 0) +
          (row.base_amount || 0) +
          (row.yahoo_amount || 0) +
          (row.mercari_amount || 0) +
          (row.rakuten_amount || 0) +
          (row.qoo10_amount || 0)
        return acc
      },
      { floor: 0, ec: 0 }
    )

    const lines = [
      "【会津ブランド館売上報告】",
      dateStr,
      `フロア日計 / ${formatCurrency(dayData.floor_sales)}`,
      `フロア累計 / ${formatCurrency(totals.floor)}`,
      `入　金 / ${formatCurrency(dayData.cash_income)}`,
      `レジ通過人数 / ${dayData.register_count}人`,
      "【WEB売上】",
      `Amazon 売上 / ${dayData.amazon_count}件 ${formatCurrency(dayData.amazon_amount)}`,
      `BASE   売上 / ${dayData.base_count}件 ${formatCurrency(dayData.base_amount)}`,
      `Yahoo! 売上 / ${dayData.yahoo_count}件 ${formatCurrency(dayData.yahoo_amount)}`,
      `メルカリ 売上 / ${dayData.mercari_count}件 ${formatCurrency(dayData.mercari_amount)}`,
      `楽天 売上 / ${dayData.rakuten_count}件 ${formatCurrency(dayData.rakuten_amount)}`,
      `Qoo10 売上 / ${dayData.qoo10_count}件 ${formatCurrency(dayData.qoo10_amount)}`,
      "------------------------------",
      `WEB売上累計 / ${formatCurrency(totals.ec)}`,
      "【月内フロア＋WEB累計売上】",
      `${formatCurrency(totals.floor + totals.ec)}`,
    ]

    res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8").send(lines.join("\n"))
  } catch (err) {
    console.error(err)
    res.status(500).send("Internal Server Error")
  }
}
