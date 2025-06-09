import type { NextApiRequest, NextApiResponse } from "next"
import { supabase } from "../../lib/supabase"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

type Totals = { floor: number; ec: number; register: number }

async function fetchMonthTotals(year: number, month: number): Promise<Totals> {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  const { data, error } = await supabase
    .from("daily_sales_report")
    .select(
      "floor_sales, register_count, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount"
    )
    .gte("date", start.toISOString().split("T")[0])
    .lte("date", end.toISOString().split("T")[0])

  if (error || !data) {
    console.error(error)
    return { floor: 0, ec: 0, register: 0 }
  }

  return (data || []).reduce(
    (acc, row) => {
      acc.floor += row.floor_sales || 0
      acc.register += row.register_count || 0
      acc.ec +=
        (row.amazon_amount || 0) +
        (row.rakuten_amount || 0) +
        (row.yahoo_amount || 0) +
        (row.mercari_amount || 0) +
        (row.base_amount || 0) +
        (row.qoo10_amount || 0)
      return acc
    },
    { floor: 0, ec: 0, register: 0 },
  )
}

async function callOpenAI(
  system: string,
  content: string,
  parse: boolean = true,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4-1106-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      max_tokens: 800,
      temperature: 0.5,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(text)
    throw new Error("Failed to call OpenAI")
  }

  const json = await res.json()
  const msg = json.choices?.[0]?.message?.content?.trim() || ""
  if (!parse) {
    return msg
  }
  try {
    return JSON.parse(msg).result || msg
  } catch {
    return msg
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0]
    const todayStr = now.toISOString().split("T")[0]

    const { data, error } = await supabase
      .from("daily_sales_report")
      .select(
        "date, floor_sales, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount"
      )
      .gte("date", startOfMonth)
      .lte("date", todayStr)
      .order("date", { ascending: true })

    if (error || !data) {
      console.error(error)
      return res.status(500).json({ error: "Failed to fetch data" })
    }

    const summaryData = data.map((d) => ({
      date: d.date,
      floor: d.floor_sales,
      ec:
        d.amazon_amount +
        d.rakuten_amount +
        d.yahoo_amount +
        d.mercari_amount +
        d.base_amount +
        d.qoo10_amount,
    }))

    const summaryComment = await callOpenAI(
      "You are a helpful assistant. Provide a short Japanese comment about the provided sales data. Respond only with plain Japanese text and do not use JSON or markdown.",
      JSON.stringify(summaryData),
      false,
    )

    // Determine month end
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isMonthEnd = tomorrow.getDate() === 1

    let compareRecentComment = ""
    let compareLastYearComment = ""
    let top3Comment = ""

    const thisTotals = await fetchMonthTotals(now.getFullYear(), now.getMonth())
    const lastYearTotals = await fetchMonthTotals(
      now.getFullYear() - 1,
      now.getMonth(),
    )

    const compareLastYearPrompt = `${now.getFullYear()}年${
      now.getMonth() + 1
    }月と${now.getFullYear() - 1}年${
      now.getMonth() + 1
    }月の売上比較です。以下のデータを参考に、傾向や気づきをコメントしてください。\n${JSON.stringify(
      {
        this_year: thisTotals,
        last_year: lastYearTotals,
      },
    )}`

    compareLastYearComment = await callOpenAI(
      "You are a helpful assistant. Provide a short Japanese comment about the provided sales comparison. Respond only with plain Japanese text and do not use JSON or markdown.",
      compareLastYearPrompt,
      false,
    )

    if (isMonthEnd) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastTotals = await fetchMonthTotals(
        lastMonth.getFullYear(),
        lastMonth.getMonth(),
      )
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      const prevTotals = await fetchMonthTotals(
        prevMonth.getFullYear(),
        prevMonth.getMonth(),
      )

      const compareRecentData = [
        {
          month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
          ...thisTotals,
        },
        {
          month: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
          ...lastTotals,
        },
        {
          month: `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`,
          ...prevTotals,
        },
      ]

      compareRecentComment = await callOpenAI(
        "You are a helpful assistant. Compare the provided monthly totals and give a short Japanese comment. Respond only with JSON like { \"result\": \"...\" }.",
        JSON.stringify(compareRecentData),
      )

      const totals = summaryData.map((d) => ({
        date: d.date,
        total: d.floor + d.ec,
      }))
      const avg =
        totals.reduce((sum, t) => sum + t.total, 0) / (totals.length || 1)
      const picked = totals
        .map((t) => ({ ...t, diff: Math.abs(t.total - avg) }))
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 3)
        .map(({ date, total }) => ({ date, total }))

      top3Comment = await callOpenAI(
        "You are a helpful assistant. Identify the days where sales were exceptionally high or low. Respond only with JSON like { \"result\": \"...\" }.",
        JSON.stringify(picked),
      )
    }

    res.status(200).json({
      summary: summaryComment,
      compare_recent: compareRecentComment,
      compare_last_year: compareLastYearComment,
      top3: top3Comment,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Internal Server Error" })
  }
}
