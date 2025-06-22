// /hooks/useCSVImport.tsx
"use client"

import { useState, useRef } from "react"
import { useDisclosure } from "@nextui-org/modal"

type ImportResult = {
  id: number
  original: string
  matched: string | null
  salesData: { [key: string]: number }
}

type ProductMaster = {
  id: string
  name: string
}

export function useCSVImport() {
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [productMaster, setProductMaster] = useState<ProductMaster[]>([])
  const [isSubmittingImport, setIsSubmittingImport] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    isOpen: isCsvModalOpen,
    onOpen: onOpenCsvModal,
    onClose: onCloseCsvModal,
  } = useDisclosure()

  const handleCsvButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, month: string) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('reportMonth', month)

    try {
      const response = await fetch('/api/import/csv', {
        method: 'POST',
        body: formData
      })
      const result = await response.json()

      if (response.ok) {
        const apiData = result.data || []
        
        const productGroups = new Map<string, any[]>()
        apiData.forEach((item: any) => {
          if (!item.csvProductName) return
          const key = item.csvProductName
          if (!productGroups.has(key)) {
            productGroups.set(key, [])
          }
          productGroups.get(key)!.push(item)
        })
        
        const convertedResults: ImportResult[] = []
        let id = 1
        
        productGroups.forEach((items, csvProductName) => {
          const salesData: { [key: string]: number } = {}
          let matchedProductName = null
          
          items.forEach((item) => {
            if (item.quantity && item.quantity > 0) {
              const ecSiteMap: { [key: string]: string } = {
                'amazon': 'Amazon',
                'rakuten': '楽天',
                'yahoo': 'Yahoo',
                'mercari': 'メルカリ',
                'base': 'BASE', 
                'qoo10': 'Qoo10'
              }
              const displayEcSite = ecSiteMap[item.ecSite] || item.ecSite
              salesData[displayEcSite] = item.quantity
            }
            
            if (item.masterProductName && !matchedProductName) {
              matchedProductName = item.masterProductName
            }
          })
          
          convertedResults.push({
            id: id++,
            original: csvProductName,
            matched: matchedProductName,
            salesData: salesData
          })
        })
        
        setImportResults(convertedResults)
        onOpenCsvModal()
      } else {
        throw new Error(result.error || '不明なエラーが発生しました')
      }
    } catch (error) {
      console.error('CSVインポートエラー:', error)
      alert(`エラー: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleImportResultChange = (id: number, newMatchedValue: string) => {
    setImportResults(currentResults =>
      currentResults.map(result =>
        result.id === id ? { ...result, matched: newMatchedValue || null } : result
      )
    )
  }

  const handleConfirmImport = async (updatedResults: ImportResult[], month: string) => {
    setIsSubmittingImport(true)
    try {
      const response = await fetch('/api/import/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: updatedResults, report_month: month }),
      })
      const result = await response.json()
      
      if (response.ok) {
        alert(result.message)
        onCloseCsvModal()
        window.location.reload()
      } else {
        throw new Error(result.error || '登録処理中にエラーが発生しました。')
      }
    } catch (error) {
      alert(`エラー: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsSubmittingImport(false)
    }
  }

  return {
    importResults,
    productMaster,
    setProductMaster,
    isSubmittingImport,
    isUploading,
    fileInputRef,
    isCsvModalOpen,
    onOpenCsvModal,
    onCloseCsvModal,
    handleCsvButtonClick,
    handleFileSelect,
    handleImportResultChange,
    handleConfirmImport,
  }
}
