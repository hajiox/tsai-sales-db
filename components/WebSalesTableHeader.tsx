// /components/WebSalesTableHeader.tsx
"use client"

import React from "react"
import {
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react"

interface WebSalesTableHeaderProps {
  currentMonth: string
  filterValue: string
  isLoading: boolean
  onMonthChange: (month: string) => void
  onFilterChange: (value: string) => void
  onDeleteMonthData: () => void
}

export default function WebSalesTableHeader({
  currentMonth,
  filterValue,
  isLoading,
  onMonthChange,
  onFilterChange,
  onDeleteMonthData,
}: WebSalesTableHeaderProps) {
  return (
    <div className="flex justify-between items-center">
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
            onAction={(key) => onMonthChange(key.toString())}
            className="max-h-64 overflow-y-auto"
          >
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
          onValueChange={onFilterChange}
          className="w-48"
        />
        <Button 
          color="danger" 
          onClick={onDeleteMonthData}
          disabled={isLoading}
        >
          {currentMonth}月 データ削除
        </Button>
      </div>
    </div>
  )
}
