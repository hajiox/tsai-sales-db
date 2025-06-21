// /components/AmazonCsvImportModal.tsx ver.1
"use client"

import React, { useState } from "react"
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@nextui-org/react"
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
        // onClose(); // 成功時にモーダルを閉じる
        router.refresh() // データをリフレッシュ
        // 少し遅れてモーダルを閉じることでメッセージ表示の確認時間を設ける
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
    <Modal isOpen={isOpen} onClose={onClose} placement="center">
      <ModalContent>
        {(onCloseModal) => ( // onCloseModalを引数で受け取る
          <>
            <ModalHeader className="flex flex-col gap-1">
              Amazon CSVインポート
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-gray-600">
                Amazonの売上CSVファイルを選択してアップロードしてください。
                商品名と販売個数を読み込み、既存データに加算します。
              </p>
              <Input
                type="file"
                onChange={handleAmazonFileChange}
                accept=".csv"
                label="Amazon CSVファイル"
                placeholder="ファイルを選択"
                labelPlacement="outside-left"
                isClearable={false}
              />
              {amazonImportMessage && (
                <p className={`text-sm ${amazonImportLoading ? 'text-blue-500' : (amazonImportMessage.includes('成功') ? 'text-green-500' : 'text-red-500')}`}>
                  {amazonImportMessage}
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onCloseModal}>
                キャンセル
              </Button>
              <Button
                color="primary"
                onPress={handleAmazonUpload}
                isDisabled={!amazonFile || amazonImportLoading}
                isLoading={amazonImportLoading}
              >
                {amazonImportLoading ? "アップロード中..." : "インポート開始"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
