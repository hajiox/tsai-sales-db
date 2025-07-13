// /app/components/brand-store/BrandStoreCsvImportModal.tsx ver.1
"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface BrandStoreCsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
  selectedYear: number
  selectedMonth: number
}

export function BrandStoreCsvImportModal({
  isOpen,
  onClose,
  onImportComplete,
  selectedYear,
  selectedMonth
}: BrandStoreCsvImportModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>CSV読込 - {selectedYear}年{selectedMonth}月</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          {/* TODO: CSV読込機能を実装 */}
          <p>CSV読込機能は次のステップで実装します</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
