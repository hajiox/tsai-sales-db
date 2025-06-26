// /types/amazonCsvTypes.ts ver.1

export interface AmazonImportResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
}

export interface UnmatchedProduct {
  amazonTitle: string
  quantity: number
  matched: false
}

export interface NewProduct {
  amazonTitle: string
  productName: string
  price: number
  quantity: number
}

export interface AllProductResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low' | 'none'
  hasData: boolean
  isDuplicate?: boolean
  duplicateInfo?: DuplicateInfo
}

export interface DuplicateInfo {
  count: number
  amazonTitles: string[]
  totalQuantity: number
  originalQuantities: number[]
}

export interface IndividualCsvProduct {
  id: string
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
  isFromDuplicate: boolean
  originalDuplicateGroup?: string
}

export interface QualityCheck {
  csvOriginalTotal: number
  csvRecordCount: number
  matchedTotal: number
  unmatchedTotal: number
  duplicateAdjustment: number
  deletedTotal: number
  finalTotal: number
  isQuantityValid: boolean
  discrepancy: number
  warningLevel: 'none' | 'warning' | 'error'
  duplicateCount: number
  productCount: number
}

export interface AmazonCsvConfirmModalProps {
  isOpen: boolean
  results: AmazonImportResult[]
  unmatchedProducts: UnmatchedProduct[]
  csvSummary: any
  productMaster: { id: string; name: string }[]
  month: string
  isSubmitting: boolean
  onClose: () => void
  onConfirm: (updatedResults: AmazonImportResult[]) => void
}
