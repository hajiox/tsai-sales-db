// /components/food-store/ProductSalesTable.tsx ver.2
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
  data: any[]
}

export function ProductSalesTable({ data }: ProductSalesTableProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">順位</TableHead>
            <TableHead>商品名</TableHead>
            <TableHead>JANコード</TableHead>
            <TableHead>カテゴリー</TableHead>
            <TableHead>仕入先</TableHead>
            <TableHead className="text-right">単価</TableHead>
            <TableHead className="text-right">個数</TableHead>
            <TableHead className="text-right">売上</TableHead>
            <TableHead className="text-right">粗利</TableHead>
            <TableHead className="text-right">粗利率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? (
            data.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>{item.product_name}</TableCell>
                <TableCell>{item.jan_code}</TableCell>
                <TableCell>{item.category || '未分類'}</TableCell>
                <TableCell>{item.supplier_name}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                <TableCell className="text-right">{item.quantity_sold.toLocaleString()}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.total_sales)}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.gross_profit)}</TableCell>
                <TableCell className="text-right">{item.gross_profit_rate}%</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                データがありません
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
