// /components/web-sales-editable-table.tsx ver.34
"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Pagination,
} from "@nextui-org/react"
import { useDisclosure } from "@nextui-org/modal"

import { supabase } from "@/lib/supabase"
import { WebSalesData, Product } from "@/types/db"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
// Suspenseは削除済み

import CsvImportConfirmModal from "./CsvImportConfirmModal"
import AmazonCsvImportModal from "./AmazonCsvImportModal" // HTMLベースのモーダルをインポート

interface WebSalesEditableTableProps {
  initialWebSalesData: WebSalesData[]
  month: string
}

const ROWS_PER_PAGE = 10

export default function WebSalesEditableTable({
  initialWebSalesData,
  month,
}: WebSalesEditableTableProps) {
  const [data, setData] = useState<WebSalesData[]>(initialWebSalesData)
  const [editMode, setEditMode] = useState<string | null>(null) // 'product_id-ec_site_name'
  const [editedValue, setEditedValue] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(month)
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map())
  const [filterValue, setFilterValue] = useState("")
  const [page, setPage] = useState(1)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // CSVインポートモーダルの制御
  const {
    isOpen: isCsvModalOpen,
    onOpen: onOpenCsvModal,
    onClose: onCloseCsvModal,
  } = useDisclosure()

  // Amazon CSVインポートモーダルの制御
  const {
    isOpen: isAmazonCsvModalOpen,
    onOpen: onOpenAmazonCsvModal,
    onClose: onCloseAmazonCsvModal,
  } = useDisclosure()

  useEffect(() => {
    setCurrentMonth(month)
  }, [month])

  useEffect(() => {
    const fetchProducts = async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select("*")
      if (error) {
        console.error("Error fetching products:", error)
        return
      }
      const map = new Map<string, Product>()
      products.forEach((p) => map.set(p.id, p))
      setProductMap(map)
    }
    fetchProducts()
  }, [])

  useEffect(() => {
    setData(initialWebSalesData)
  }, [initialWebSalesData])

  const getProductName = (productId: string) => {
    return productMap.get(productId)?.name || "不明な商品"
  }

  const getProductSeriesCode = (productId: string) => {
    return productMap.get(productId)?.series_code || 9999
  }

  const getProductNumber = (productId: string) => {
    return productMap.get(productId)?.product_number || 9999
  }

  const getProductPrice = (productId: string) => {
    return productMap.get(productId)?.price || 0
  }

  const filteredItems = useMemo(() => {
    // dataがnullまたはundefinedの場合に備える
    if (!data) {
      return [];
    }

    const sortedData = [...data].sort((a, b) => {
      const seriesCodeA = getProductSeriesCode(a.product_id)
      const seriesCodeB = getProductSeriesCode(b.product_id)
      if (seriesCodeA !== seriesCodeB) {
        return seriesCodeA - seriesCodeB
      }
      const productNumberA = getProductNumber(a.product_id)
      const productNumberB = getProductNumber(b.product_id)
      return productNumberA - productNumberB
    })

    if (!filterValue) {
      return sortedData
    }
    return sortedData.filter((item) =>
      getProductName(item.product_id)
        .toLowerCase()
        .includes(filterValue.toLowerCase()),
    )
  }, [data, filterValue, productMap])

  const pages = Math.ceil(filteredItems.length / ROWS_PER_PAGE)

  const items = useMemo(() => {
    // filteredItemsがnullまたはundefinedの場合に備える
    if (!filteredItems) {
      return [];
    }
    const start = (page - 1) * ROWS_PER_PAGE
    const end = start + ROWS_PER_PAGE
    return filteredItems.slice(start, end)
  }, [page, filteredItems])

  const handleEdit = (
    productId: string,
    ecSite: string,
    currentValue: number | null,
  ) => {
    setEditMode(`${productId}-${ecSite}`)
    setEditedValue(currentValue?.toString() || "")
  }

  const handleSave = async (productId: string, ecSite: string) => {
    setIsLoading(true)
    const newValue = parseInt(editedValue)

    if (isNaN(newValue)) {
      alert("有効な数値を入力してください。")
      setIsLoading(false)
      return
    }

    const updatedData = data.map((item) =>
      item.product_id === productId
        ? { ...item, [`${ecSite}_count`]: newValue }
        : item,
    )
    setData(updatedData)

    try {
      const updatePayload: any = { product_id: productId, report_month: month }
      updatePayload[`${ecSite}_count`] = newValue

      // 金額も同時に更新する場合
      const price = getProductPrice(productId)
      if (price !== undefined) {
        updatePayload[`${ecSite}_amount`] = newValue * price
      }

      const { error } = await supabase
        .from("web_sales_summary")
        .upsert([updatePayload], { onConflict: "product_id, report_month" })

      if (error) {
        console.error("Error updating data:", error)
        alert("データの保存に失敗しました。")
      } else {
        console.log("Data saved successfully.")
      }
    } catch (error) {
      console.error("Error during save operation:", error)
      alert("データの保存中にエラーが発生しました。")
    } finally {
      setEditMode(null)
      setEditedValue("")
      setIsLoading(false)
    }
  }

  const handleMonthChange = useCallback(
    (selectedMonth: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("month", selectedMonth)
      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, router, pathname],
  )

  const getTotal = (ecSite: string) => {
    return filteredItems.reduce((sum, item) => {
      const count = item[`${ecSite}_count`] || 0
      return sum + count
    }, 0)
  }

  const getTotalAmount = (ecSite: string) => {
    return filteredItems.reduce((sum, item) => {
      const amount = item[`${ecSite}_amount`] || 0
      return sum + amount
    }, 0)
  }

  const getTotalAllECSites = () => {
    const ecSites = [
      "amazon",
      "rakuten",
      "yahoo",
      "mercari",
      "base",
      "qoo10",
    ]
    return ecSites.reduce((totalSum, site) => totalSum + getTotal(site), 0)
  }

  const getTotalAmountAllECSites = () => {
    const ecSites = [
      "amazon",
      "rakuten",
      "yahoo",
      "mercari",
      "base",
      "qoo10",
    ]
    return ecSites.reduce((totalSum, site) => totalSum + getTotalAmount(site), 0)
  }

  const handleDeleteMonthData = async () => {
    if (
      !window.confirm(
        `${currentMonth}のすべての売上データを削除します。本当によろしいですか？`,
      )
    ) {
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase
        .from("web_sales_summary")
        .delete()
        .eq("report_month", currentMonth + "-01") // DBのカラムに合わせてyyyy-mm-dd形式に
      if (error) {
        console.error("Error deleting month data:", error)
        alert("月別データの削除に失敗しました。")
      } else {
        alert(`${currentMonth}の売上データが正常に削除されました。`)
        setData([]) // UIからデータをクリア
        router.refresh() // ページをリフレッシュして最新の状態を反映
      }
    } catch (error) {
      console.error("Error during delete operation:", error)
      alert("月別データの削除中にエラーが発生しました。")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            WEB販売実績 ({currentMonth}月)
          </h2>
          <div className="flex gap-2">
            <Dropdown>
              <DropdownTrigger>
                <Button variant="bordered" className="w-32">
                  {currentMonth}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Month selection"
                selectedKeys={[currentMonth]}
                onAction={(key) => handleMonthChange(key.toString())}
                className="max-h-64 overflow-y-auto"
              >
                {/* 2023年からの月を生成 */}
                {Array.from({ length: 36 }, (_, i) => {
                  const date = new Date(2023, i, 1)
                  const year = date.getFullYear()
                  const month = (date.getMonth() + 1).toString().padStart(2, "0")
                  const value = `${year}-${month}`
                  return (
                    <DropdownItem key={value} value={value}>
                      {year}年{month}月
                    </DropdownItem>
                  )
                })}
              </DropdownMenu>
            </Dropdown>
            <Input
              placeholder="商品名で検索"
              value={filterValue}
              onValueChange={setFilterValue}
              className="w-48"
            />
            {/* 既存のCSVインポートボタン */}
            <Button color="primary" onClick={onOpenCsvModal}>
              CSVインポート
            </Button>
            {/* Amazon CSVインポートボタン（既存のボタンに紐付け） */}
            <Button color="secondary" onClick={onOpenAmazonCsvModal}>
              Amazon CSVインポート
            </Button>
            <Button color="danger" onClick={handleDeleteMonthData}>
              {currentMonth}月 データ削除
            </Button>
          </div>
        </div>

        <Table
          aria-label="WEB販売実績テーブル"
          bottomContent={
            <div className="flex w-full justify-center">
              <Pagination
                isCompact
                showControls
                showShadow
                color="primary"
                page={page}
                total={pages}
                onChange={(page) => setPage(page)}
              />
            </div>
          }
          classNames={{
            wrapper: "min-h-[222px]",
          }}
        >
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
          <TableBody emptyContent={"データがありません"} items={items || []}> {/* itemsにundefinedチェックを追加 */}
            {(item) => ( // render props形式でitemsを渡す
              <TableRow key={item.product_id}>
                <TableCell className="text-left text-xs">
                  {getProductName(item.product_id)}
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
                  const cellKey = `${item.product_id}-${site}`
                  const count = item[`${site}_count`] || 0
                  const amount = item[`${site}_amount`] || 0
                  const displayValue = `${count}` // 金額は表示しない
                  return (
                    <TableCell key={cellKey}>
                      <div
                        onClick={() => handleEdit(item.product_id, site, count)}
                        className={`cursor-pointer hover:bg-gray-100 p-1 rounded text-center ${
                          editMode === cellKey ? "bg-blue-50" : ""
                        }`}
                      >
                        {editMode === cellKey ? (
                          <Input
                            autoFocus
                            value={editedValue}
                            onChange={(e) => setEditedValue(e.target.value)}
                            onBlur={() => handleSave(item.product_id, site)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSave(item.product_id, site)
                              } else if (e.key === "Escape") {
                                setEditMode(null)
                                setEditedValue("")
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
                      (sum, site) => sum + (item[`${site}_count`] || 0),
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
                        (sum, site) => sum + (item[`${site}_amount`] || 0),
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
                      (sum, site) => sum + (item[`${site}_amount`] || 0),
                      0,
                    ),
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex justify-end gap-4 text-sm mt-4 mr-4">
          <p>合計販売数: {new Intl.NumberFormat("ja-JP").format(getTotalAllECSites())}</p>
          <p>合計売上金額: ¥{new Intl.NumberFormat("ja-JP").format(getTotalAmountAllECSites())}</p>
        </div>
      </div>
      <CsvImportConfirmModal isOpen={isCsvModalOpen} onClose={onCloseCsvModal} />
      <AmazonCsvImportModal isOpen={isAmazonCsvModalOpen} onClose={onCloseAmazonCsvModal} />
    </>
  )
}
