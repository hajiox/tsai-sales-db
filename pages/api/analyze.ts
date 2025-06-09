import type { NextApiRequest, NextApiResponse } from "next"
import { supabase } from "../../lib/supabase"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0]

    const { data, error } = await supabase
      .from("daily_sales_report")
      .select(
        "date, floor_sales, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount"
      )
      .gte("date", startOfMonth)
      .order("date", { ascending: true })

    if (error || !data) {
      console.error(error)
      return res.status(500).json({ error: "Failed to fetch data" })
    }

    const summary = data.map((d) => ({
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

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4-1106-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant. Provide a short Japanese comment about the provided sales data. Respond only with JSON like { \"result\": \"...\" }.",
          },
          { role: "user", content: JSON.stringify(summary) },
        ],
        max_tokens: 100,
        temperature: 0.5,
      }),
    })

    if (!openaiRes.ok) {
      const text = await openaiRes.text()
      console.error(text)
      return res.status(500).json({ error: "Failed to call OpenAI" })
    }

    const openaiJson = await openaiRes.json()
    const comment =
      openaiJson.choices?.[0]?.message?.content?.trim() || ""

    res.status(200).json({ result: comment })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Internal Server Error" })
  }
}
