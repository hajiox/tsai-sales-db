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

    const monthTotals = monthRows.reduce(
      (acc, row) => {
        acc.amazon += row.amazon_amount || 0
        acc.base += row.base_amount || 0
        acc.yahoo += row.yahoo_amount || 0
        acc.mercari += row.mercari_amount || 0
        acc.rakuten += row.rakuten_amount || 0
        acc.qoo10 += row.qoo10_amount || 0
        acc.floor += row.floor_sales || 0
        return acc
      },
      { amazon: 0, base: 0, yahoo: 0, mercari: 0, rakuten: 0, qoo10: 0, floor: 0 }
    )

    const totals = {
      floor: monthTotals.floor,
      ec:
        monthTotals.amazon +
        monthTotals.base +
        monthTotals.yahoo +
        monthTotals.mercari +
        monthTotals.rakuten +
        monthTotals.qoo10,
    }

    const lines = [
      "【会津ブランド館売上報告】",
      dateStr,
      `フロア日計 / ${formatCurrency(dayData.floor_sales)}`,
      `フロア累計 / ${formatCurrency(totals.floor)}`,
      `入　金 / ${formatCurrency(dayData.cash_income)}`,
      `レジ通過人数 / ${dayData.register_count}人`,
      "【WEB売上】",
    ]

    if (dayData.amazon_count > 0) {
      lines.push(
        `Amazon 売上 / ${dayData.amazon_count}件 ${formatCurrency(dayData.amazon_amount)}`,
      )
    }
    if (dayData.base_count > 0) {
      lines.push(
        `BASE   売上 / ${dayData.base_count}件 ${formatCurrency(dayData.base_amount)}`,
      )
    }
    if (dayData.yahoo_count > 0) {
      lines.push(
        `Yahoo! 売上 / ${dayData.yahoo_count}件 ${formatCurrency(dayData.yahoo_amount)}`,
      )
    }
    if (dayData.mercari_count > 0) {
      lines.push(
        `メルカリ 売上 / ${dayData.mercari_count}件 ${formatCurrency(dayData.mercari_amount)}`,
      )
    }
    if (dayData.rakuten_count > 0) {
      lines.push(
        `楽天 売上 / ${dayData.rakuten_count}件 ${formatCurrency(dayData.rakuten_amount)}`,
      )
    }
    if (dayData.qoo10_count > 0) {
      lines.push(
        `Qoo10 売上 / ${dayData.qoo10_count}件 ${formatCurrency(dayData.qoo10_amount)}`,
      )
    }

    if (monthTotals.amazon > 0) {
      lines.push(`Amazon累計 / ${formatCurrency(monthTotals.amazon)}`)
    }
    if (monthTotals.base > 0) {
      lines.push(`BASE累計   / ${formatCurrency(monthTotals.base)}`)
    }
    if (monthTotals.yahoo > 0) {
      lines.push(`Yahoo!累計 / ${formatCurrency(monthTotals.yahoo)}`)
    }
    if (monthTotals.mercari > 0) {
      lines.push(`メルカリ累計 / ${formatCurrency(monthTotals.mercari)}`)
    }
    if (monthTotals.rakuten > 0) {
      lines.push(`楽天累計 / ${formatCurrency(monthTotals.rakuten)}`)
    }
    if (monthTotals.qoo10 > 0) {
      lines.push(`Qoo10累計 / ${formatCurrency(monthTotals.qoo10)}`)
    }

    lines.push("------------------------------")
    lines.push(`WEB売上累計 / ${formatCurrency(totals.ec)}`)
    lines.push("【月内フロア＋WEB累計売上】")
    lines.push(`${formatCurrency(totals.floor + totals.ec)}`)

    res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8").send(lines.join("\n"))
  } catch (err) {
    console.error(err)
    res.status(500).send("Internal Server Error")
  }
}
