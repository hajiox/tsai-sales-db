// /components/wholesale/oem-customer-dialog.tsx ver.1
'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserPlus } from 'lucide-react'

interface CustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => Promise<void>
}

export function OEMCustomerDialog({ open, onOpenChange, onSubmit }: CustomerDialogProps) {
  const [customerName, setCustomerName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!customerName) return
    
    setIsSubmitting(true)
    try {
      await onSubmit(customerName)
      setCustomerName('')
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setCustomerName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新規顧客登録</DialogTitle>
          <DialogDescription>
            顧客名を入力してください。顧客コードは自動で採番されます。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customer-name" className="text-right">
              顧客名
            </Label>
            <Input
              id="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="col-span-3"
              disabled={isSubmitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!customerName || isSubmitting}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
