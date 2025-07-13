// /app/components/brand-store/ProductSalesTable.tsx ver.1
"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"

interface ProductSalesTableProps {
  data: Array<{
    product_name: string
    category: string
    quantity_sold: number
    total_sales: number
  }>
}

export function ProductSalesTable({ data }: ProductSalesTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-gray-500">
        データがありません
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">商品名</TableHead>
            <TableHead className="w-[25%]">カテゴリー</TableHead>
            <TableHead className="w-[15%] text-right">販売数</TableHead>
            <TableHead className="w-[20%] text-right">総売上</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{item.product_name}</TableCell>
              <TableCell>{item.category || "未設定"}</TableCell>
              <TableCell className="text-right">
                {item.quantity_sold.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(item.total_sales)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
