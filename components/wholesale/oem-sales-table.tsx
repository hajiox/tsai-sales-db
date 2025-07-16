// /components/wholesale/oem-sales-table.tsx ver.1
'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Trash2 } from 'lucide-react'

interface SaleData {
  id: string
  product_name: string
  customer_name: string
  unit_price: number
  quantity: number
  amount: number
}

interface OEMSalesTableProps {
  sales: SaleData[]
  onDelete: (saleId: string) => void
}

export function OEMSalesTable({ sales, onDelete }: OEMSalesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>商品名</TableHead>
          <TableHead>発注者</TableHead>
          <TableHead className="text-right">単価</TableHead>
          <TableHead className="text-right">個数</TableHead>
          <TableHead className="text-right">合計金額</TableHead>
          <TableHead className="w-[100px]">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sales.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-gray-500">
              データがありません
            </TableCell>
          </TableRow>
        ) : (
          sales.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell>{sale.product_name}</TableCell>
              <TableCell>{sale.customer_name}</TableCell>
              <TableCell className="text-right">¥{sale.unit_price.toLocaleString()}</TableCell>
              <TableCell className="text-right">{sale.quantity}</TableCell>
              <TableCell className="text-right">¥{sale.amount.toLocaleString()}</TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(sale.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
