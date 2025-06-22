// /components/WebSalesDataTable.tsx
"use client"

import React from "react"
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Input,
} from "@nextui-org/react"
import { WebSalesData } from "@/types/db"

interface WebSalesDataTableProps {
  filteredItems: WebSalesData[]
  editMode: string | null
  editedValue: string
  getProductName: (productId: string) => string
  onEdit: (productId: string, ecSite: string, currentValue: number | null) => void
  onSave: (productId: string, ecSite: string) => void
  onEditValueChange: (value: string) => void
  onCancel: () => void
}

export default function WebSalesDataTable({
  filteredItems,
  editMode,
  editedValue,
  getProductName,
  onEdit,
  onSave,
  onEditValueChange,
  onCancel,
}: WebSalesDataTableProps) {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-semibold">全商品一覧 ({filteredItems.length}商品)</h3>
      </div>

      <Table aria-label="WEB販売実績テーブル">
        <TableHeader>
          <TableColumn key="product_name" className="w-52">
            商品名
          </TableColumn>
          <TableColumn key="amazon" className="w-24 text-center">
            Amazon
          </TableColumn>
          <TableColumn key="rakuten" className="w-24 text-center">
            楽天
          </TableColumn>
          <TableColumn key="yahoo" className="w-24 text-center">
            Yahoo!
          </TableColumn>
          <TableColumn key="mercari" className="w-24 text-center">
            メルカリ
          </TableColumn>
          <TableColumn key="base" className="w-24 text-center">
            BASE
          </TableColumn>
          <TableColumn key="qoo10" className="w-24 text-center">
            Qoo10
          </TableColumn>
          <TableColumn key="total_count" className="w-24 text-center">
            合計数
          </TableColumn>
          <TableColumn key="total_amount" className="w-28 text-center">
            合計金額
          </TableColumn>
        </TableHeader>
        <TableBody emptyContent={"データがありません"}>
          {filteredItems.map((row) => (
            <TableRow key={row.product_id}>
              <TableCell className="text-left text-xs">
                {getProductName(row.product_id)}
              </TableCell>
              {(
                [
                  "amazon",
                  "rakuten",
                  "yahoo",
                  "mercari",
                  "base",
                  "qoo10",
                ] as const
              ).map((site) => {
                const cellKey = `${row.product_id}-${site}`
                const count = row[`${site}_count`] || 0
                const amount = row[`${site}_amount`] || 0
                const displayValue = `${count}`
                return (
                  <TableCell key={cellKey}>
                    <div
                      onClick={() => onEdit(row.product_id, site, count)}
                      className={`cursor-pointer hover:bg-gray-100 p-1 rounded text-center ${
                        editMode === cellKey ? "bg-blue-50" : ""
                      }`}
                    >
                      {editMode === cellKey ? (
                        <Input
                          autoFocus
                          value={editedValue}
                          onChange={(e) => onEditValueChange(e.target.value)}
                          onBlur={() => onSave(row.product_id, site)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onSave(row.product_id, site)
                            } else if (e.key === "Escape") {
                              onCancel()
                            }
                          }}
                          type="number"
                          className="text-center"
                          size="sm"
                        />
                      ) : (
                        displayValue
                      )}
                    </div>
                    <div className="text-xs text-gray-500 text-center">
                      ¥{new Intl.NumberFormat("ja-JP").format(amount)}
                    </div>
                  </TableCell>
                )
              })}
              <TableCell className="text-center font-bold">
                {new Intl.NumberFormat("ja-JP").format(
                  [
                    "amazon",
                    "rakuten",
                    "yahoo",
                    "mercari",
                    "base",
                    "qoo10",
                  ].reduce(
                    (sum, site) => sum + (row[`${site}_count`] || 0),
                    0,
                  ),
                )}
                <div className="text-xs text-gray-500">
                  ¥
                  {new Intl.NumberFormat("ja-JP").format(
                    [
                      "amazon",
                      "rakuten",
                      "yahoo",
                      "mercari",
                      "base",
                      "qoo10",
                    ].reduce(
                      (sum, site) => sum + (row[`${site}_amount`] || 0),
                      0,
                    ),
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center font-bold">
                ¥
                {new Intl.NumberFormat("ja-JP").format(
                  [
                    "amazon",
                    "rakuten",
                    "yahoo",
                    "mercari",
                    "base",
                    "qoo10",
                  ].reduce(
                    (sum, site) => sum + (row[`${site}_amount`] || 0),
                    0,
                  ),
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
