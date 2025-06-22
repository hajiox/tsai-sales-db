// /components/AmazonCsvImportModal.tsx ver.4
"use client"

import React, { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AmazonCsvConfirmModal from "./AmazonCsvConfirmModal"

interface AmazonImportResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
}

interface AmazonCsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  month: string
}

export default function AmazonCsvImportModal({ isOpen, onClose, month }: AmazonCsvImportModalProps) {
  const [amazonFile, setAmazonFile] = useState<File | null>(null)
  const [amazonImportMessage, setAmazonImportMessage] = useState<string>("")
  const [amazonImportLoading, setAmazonImportLoading] = useState(false)
  const [importResults, setImportResults] = useState<AmazonImportResult[]>([])
  const [productMaster, setProductMaster] = useState<{ id: string; name: string }[]>([])
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isSubmittingImport, setIsSubmittingImport] = useState(false)
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)

  // isOpenに応じてモーダルを表示/非表示
  useEffect(() => {
    if (dialogRef.current) {
      if (isOpen) {
        dialogRef.current.showModal()
        // 商品マスターデータを取得
        fetchProductMaster()
      } else {
        dialogRef.current.close()
      }
    }
  }, [isOpen])

  const fetchProductMaster = async () => {
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name')
        .order('series_code, product_number')
      
      if (error) {
        console.error('Product master fetch error:', error)
        return
      }
      
      console.log('商品マスター取得:', products?.length || 0, '件')
      setProductMaster(products?.map((p: any) => ({ id: p.id, name: p.name })) || [])
    } catch (error) {
      console.error('Product master fetch error:', error)
    }
  }

  const handleAmazonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAmazonFile(e.target.files[0])
      setAmazonImportMessage("") // メッセージをクリア
    } else {
      setAmazonFile(null)
    }
  }

  const handleAmazonUpload = async () => {
    if (!amazonFile) {
      setAmazonImportMessage("ファイルを選択してください。")
      return
    }

    setAmazonImportLoading(true)
    setAmazonImportMessage("CSVを解析中...")

    const formData = new FormData()
    formData.append("file", amazonFile)
    formData.append("month", month)

    try {
      const response = await fetch("/api/import/amazon-parse", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setImportResults(result.matchedResults || [])
        setUnmatchedProducts(result.unmatchedProducts || [])
        setCsvSummary(result.summary || null)
        setAmazonImportMessage("")
        // メインモーダルを閉じて確認モーダルを表示
        onClose()
        setShowConfirmModal(true)
      } else {
        setAmazonImportMessage(result.error || "Amazon CSVの解析に失敗しました。")
      }
    } catch (error) {
      console.error("Amazon CSV解析エラー:", error)
      setAmazonImportMessage("ファイルの解析中にエラーが発生しました。")
    } finally {
      setAmazonImportLoading(false)
    }
  }

  const handleConfirmImport = async (updatedResults: AmazonImportResult[]) => {
    setIsSubmittingImport(true)
    
    try {
      const response = await fetch("/api/import/amazon-confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          results: updatedResults,
          month: month
        }),
      })

      const result = await response.json()

      if (response.ok) {
        setAmazonImportMessage(result.message || "Amazonデータが正常にインポートされました。")
        setShowConfirmModal(false)
        
        // 複数の方法でデータを更新
        router.refresh() // Next.jsのルーター更新
        window.location.reload() // 強制リロード
        
        // 1秒後に全体を閉じる
        setTimeout(() => {
          onClose()
          setAmazonFile(null)
          setImportResults([])
          setAmazonImportMessage("")
        }, 1000)
      } else {
        setAmazonImportMessage(result.error || "Amazonデータのインポートに失敗しました。")
        setShowConfirmModal(false)
      }
    } catch (error) {
      console.error("Amazon確定インポートエラー:", error)
      setAmazonImportMessage("データの保存中にエラーが発生しました。")
      setShowConfirmModal(false)
    } finally {
      setIsSubmittingImport(false)
    }
  }

  const handleCloseConfirmModal = () => {
    setShowConfirmModal(false)
    setImportResults([])
    setUnmatchedProducts([])
    setCsvSummary(null)
  }

  return (
    <>
      <dialog ref={dialogRef} className="modal p-6 rounded-lg shadow-xl backdrop:bg-black backdrop:bg-opacity-50">
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">Amazon CSVインポート</h3>
          <p className="py-2 text-sm text-gray-600">
            Amazonの売上CSVファイルを選択してアップロードしてください。
            商品名のマッチング確認画面を経由してAmazon列のみを更新します。
          </p>
          <div className="form-control w-full my-4">
            <label htmlFor="amazon-csv-file" className="label cursor-pointer justify-start">
              <span className="label-text mr-2">Amazon CSVファイル:</span>
              <input
                id="amazon-csv-file"
                type="file"
                onChange={handleAmazonFileChange}
                accept=".csv"
                className="file-input file-input-bordered file-input-sm w-full max-w-xs"
              />
            </label>
          </div>
          {amazonImportMessage && (
            <p className={`text-sm ${amazonImportLoading ? 'text-blue-500' : (amazonImportMessage.includes('成功') ? 'text-green-500' : 'text-red-500')}`}>
              {amazonImportMessage}
            </p>
          )}
          <div className="modal-action flex justify-end gap-2 mt-6">
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setAmazonImportMessage("")
                setAmazonFile(null)
                setImportResults([])
                onClose()
              }}
              disabled={amazonImportLoading}
            >
              キャンセル
            </button>
            <button
              className={`btn btn-sm btn-primary ${amazonImportLoading ? 'loading' : ''}`}
              onClick={handleAmazonUpload}
              disabled={!amazonFile || amazonImportLoading}
            >
              {amazonImportLoading ? "解析中..." : "次へ（確認画面）"}
            </button>
          </div>
        </div>
      </dialog>

      {/* 確認モーダル */}
      <AmazonCsvConfirmModal
        isOpen={showConfirmModal}
        results={importResults}
        unmatchedProducts={unmatchedProducts}
        csvSummary={csvSummary}
        productMaster={productMaster}
        month={month}
        isSubmitting={isSubmittingImport}
        onClose={handleCloseConfirmModal}
        onConfirm={handleConfirmImport}
      />
    </>
  )
}
