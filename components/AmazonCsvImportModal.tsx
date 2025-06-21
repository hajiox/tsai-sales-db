// /components/AmazonCsvImportModal.tsx ver.3
"use client"

import React, { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"

interface AmazonCsvImportModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AmazonCsvImportModal({ isOpen, onClose }: AmazonCsvImportModalProps) {
  const [amazonFile, setAmazonFile] = useState<File | null>(null)
  const [amazonImportMessage, setAmazonImportMessage] = useState<string>("")
  const [amazonImportLoading, setAmazonImportLoading] = useState(false)
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)

  // isOpenに応じてモーダルを表示/非表示
  useEffect(() => {
    if (dialogRef.current) {
      if (isOpen) {
        dialogRef.current.showModal()
      } else {
        dialogRef.current.close()
      }
    }
  }, [isOpen])

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
    setAmazonImportMessage("アップロード中...")

    const formData = new FormData()
    formData.append("file", amazonFile)

    try {
      const response = await fetch("/api/import/amazon", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setAmazonImportMessage(result.message || "Amazonデータが正常にインポートされました。")
        router.refresh() // データをリフレッシュ
        setTimeout(() => {
          onClose();
          setAmazonFile(null); // ファイル選択をリセット
        }, 1500); // 1.5秒後に閉じる
      } else {
        setAmazonImportMessage(result.error || "Amazonデータのインポートに失敗しました。")
        setAmazonImportLoading(false); // エラー時はローディング解除
      }
    } catch (error) {
      console.error("Amazonアップロードエラー:", error)
      setAmazonImportMessage("ファイルのアップロード中にエラーが発生しました。")
      setAmazonImportLoading(false); // エラー時はローディング解除
    } finally {
      // setAmazonFile(null); // 成功時のみ外部でリセットするため、ここではコメントアウト
    }
  }

  return (
    <dialog ref={dialogRef} className="modal p-6 rounded-lg shadow-xl backdrop:bg-black backdrop:bg-opacity-50">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Amazon CSVインポート</h3>
        <p className="py-2 text-sm text-gray-600">
          Amazonの売上CSVファイルを選択してアップロードしてください。
          商品名と販売個数を読み込み、既存データに加算します。
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
              setAmazonImportMessage(""); // メッセージをクリア
              setAmazonFile(null); // ファイル選択をリセット
              onClose();
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
            {amazonImportLoading ? "処理中..." : "インポート開始"}
          </button>
        </div>
      </div>
    </dialog>
  )
}
