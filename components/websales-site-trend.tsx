"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts"
import ClientOnly from '@/components/common/ClientOnly'; // ver.1 (2025-08-19 JST) - client-only charts
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'; // ver.1 (2025-08-19 JST) - browser singleton client
const supabase = getSupabaseBrowserClient(); // ver.1 (2025-08-19 JST)

const SITES = [
  { key: "amazon", name: "Amazon", color: "#3b82f6" },
  { key: "rakuten", name: "楽天", color: "#f59e0b" },
  { key: "yahoo", name: "Yahoo", color: "#f43f5e" },
  { key: "mercari", name: "メルカリ", color: "#8b5cf6" },
  { key: "base", name: "BASE", color: "#10b981" },
  { key: "qoo10", name: "Qoo10", color: "#6366f1" },
]

type ChartRow = { month: string } & Record<string, number>

export default function WebSalesSiteTrend() {
  const [products, setProducts] = useState<string[]>([])
  const [product, setProduct] = useState<string>("")
  const [data, setData] = useState<ChartRow[]>([])

  useEffect(() => {
    const loadProducts = async () => {
      const { data, error } = await supabase.from("web_sales").select("product_name")
      if (error) {
        console.error("load_products", error)
        return
      }
      const names = Array.from(new Set((data || []).map((r: any) => r.product_name).filter(Boolean))).sort()
      setProducts(names)
      if (names.length > 0) setProduct(names[0])
    }
    loadProducts()
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      if (!product) {
        setData([])
        return
      }
      const end = new Date()
      end.setDate(1)
      end.setHours(0, 0, 0, 0)
      const start = new Date(end)
      start.setMonth(start.getMonth() - 5)

      const { data, error } = await supabase
        .from("web_sales")
        .select("created_at, amazon, rakuten, yahoo, mercari, base, qoo10")
        .eq("product_name", product)
        .gte("created_at", start.toISOString())
        .lt("created_at", new Date(end.getFullYear(), end.getMonth() + 1, 1).toISOString())

      if (error) {
        console.error("fetch_error", error)
        return
      }

      const map: Record<string, ChartRow> = {}
      for (let i = 0; i < 6; i++) {
        const d = new Date(start)
        d.setMonth(start.getMonth() + i)
        const key = `${d.getFullYear()}/${("0" + (d.getMonth() + 1)).slice(-2)}`
        map[key] = { month: key }
        SITES.forEach((s) => (map[key][s.key] = 0))
      }

      ;(data || []).forEach((row: any) => {
        const d = new Date(row.created_at)
        const key = `${d.getFullYear()}/${("0" + (d.getMonth() + 1)).slice(-2)}`
        const item = map[key]
        if (!item) return
        SITES.forEach((s) => {
          item[s.key] += row[s.key] ?? 0
        })
      })

      setData(Object.values(map))
    }
    fetchData()
  }, [product])

  return (
    <Card>
      <CardHeader>
        <CardTitle>サイト別売上推移</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <select
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          className="border rounded p-1 text-sm"
        >
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <ClientOnly>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: 10, right: 10 }}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                {SITES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ClientOnly>
      </CardContent>
    </Card>
  )
}
