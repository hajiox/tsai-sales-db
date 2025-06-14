"use client"
import { Button } from "@/components/ui/button"

export default function WebSalesEdit({ month }: { month: string }) {
  const handleDelete = () => {
    if (confirm(`${month} のデータを削除しますか？`)) {
      alert("削除しました")
    }
  }

  return (
    <div>
      <Button variant="destructive" onClick={handleDelete}>
        指定月データを一括削除
      </Button>
    </div>
  )
}
