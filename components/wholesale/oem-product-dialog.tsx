// /components/wholesale/oem-product-dialog.tsx ver.1
'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PackagePlus } from 'lucide-react'

interface ProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string, price: string) => Promise<void>
}

export function OEMProductDialog({ open, onOpenChange, onSubmit }: ProductDialogProps) {
  const [productName, setProductName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!productName || !productPrice) return
    
    setIsSubmitting(true)
    try {
      await onSubmit(productName, productPrice)
      setProductName('')
      setProductPrice('')
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setProductName('')
    setProductPrice('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新規商品登録</DialogTitle>
          <DialogDescription>
            商品名と価格を入力してください。商品コードは自動で採番されます。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="product-name" className="text-right">
              商品名
            </Label>
            <Input
              id="product-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="col-span-3"
              disabled={isSubmitting}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="product-price" className="text-right">
              価格
            </Label>
            <Input
              id="product-price"
              type="number"
              value={productPrice}
              onChange={(e) => setProductPrice(e.target.value)}
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
            disabled={!productName || !productPrice || isSubmitting}
          >
            <PackagePlus className="h-4 w-4 mr-2" />
            登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
