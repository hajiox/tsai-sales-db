// /components/AmazonCsvConfirmModal.tsx ver.8 (簡素化+品質管理機能)
"use client"

import React, { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import ProductAddModal from "./ProductAddModal"
import DuplicateResolverModal from "./DuplicateResolverModal"
import QualityCheckPanel from "./QualityCheckPanel"

interface AmazonImportResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
}

interface AmazonCsvConfirmModalProps {
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

interface UnmatchedProduct {
  amazonTitle: string
  quantity: number
  matched: false
}

interface NewProduct {
  amazonTitle: string
  productName: string
  price: number
  quantity: number
}

interface AllProductResult {
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

interface DuplicateInfo {
  count: number
  amazonTitles: string[]
  totalQuantity: number
  originalQuantities: number[]
}

interface IndividualCsvProduct {
  id: string
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
  isFromDuplicate: boolean
  originalDuplicateGroup?: string
}

interface QualityCheck {
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

export default function AmazonCsvConfirmModal({
  isOpen,
  results,
  unmatchedProducts = [],
  csvSummary = null,
  productMaster,
  month,
  isSubmitting,
  onClose,
  onConfirm,
}: AmazonCsvConfirmModalProps) {
  
  // 🔥 重複検出システム
  const detectDuplicates = (results: AmazonImportResult[]): { cleanResults: AllProductResult[], duplicates: AllProductResult[], individualProducts: IndividualCsvProduct[] } => {
    const productMap = new Map<string, AmazonImportResult[]>()
    
    results.forEach(result => {
      if (!productMap.has(result.productId)) {
        productMap.set(result.productId, [])
      }
      productMap.get(result.productId)!.push(result)
    })
    
    const cleanResults: AllProductResult[] = []
    const duplicates: AllProductResult[] = []
    const individualProducts: IndividualCsvProduct[] = []
    
    productMaster.forEach(product => {
      const matchedResults = productMap.get(product.id) || []
      
      if (matchedResults.length === 0) {
        cleanResults.push({
          productId: product.id,
          productName: product.name,
          amazonTitle: '',
          quantity: 0,
          matched: true,
          matchType: 'none',
          hasData: false,
          isDuplicate: false
        })
      } else if (matchedResults.length === 1) {
        const result = matche
