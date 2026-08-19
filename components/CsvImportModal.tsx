// /components/CsvImportModal.tsx ver.2
// 汎用CSVインポートModal（UI改善版）

"use client"

import React, { useState } from "react"
import { X, Upload, Check, AlertCircle, FileText } from "lucide-react"

interface Product {
  id: string
  name: string
  series?: string
}

interface ParsedItem {
  csvTitle: string
  amazonCount: number
  rakutenCount: number
  yahooCount: number
  mercariCount: number
  baseCount: number
  qoo10Count: number
  matchedProduct: Product | null
  confidence: number
}

interface CsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  products: Product[]
}

export default function CsvImportModal({
  isOpen,
  onClose,
  onSuccess,
  products
}: CsvImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('ファイルを選択してください')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // 現在の月度を取得（画面のURL paramsから）
      const urlParams = new URLSearchParams(window.location.search)
      const currentMonth = urlParams.get('month') || new Date().toISOString().slice(0, 7)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('month', currentMonth)

      const response = await fetch('/api/import/csv-parse', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'CSV解析に失敗しました')
      }

      setParseResult(result)
      setStep('preview')
      console.log('CSV解析成功:', result.summary)

    } catch (error) {
      console.error('CSV解析エラー:', error)
      setError(error instanceof Error ? error.message : 'CSV解析中にエラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleManualMatch = (index: number, productId: string) => {
    if (!parseResult) return

    const updatedData = [...parseResult.data]
    const selectedProduct = products.find(p => p.id === productId)
    
    updatedData[index] = {
      ...updatedData[index],
      matchedProduct: selectedProduct || null,
      confidence: selectedProduct ? 1.0 : 0
    }

    setParseResult({
      ...parseResult,
      data: updatedData
    })
  }

  const handleConfirm = async () => {
    if (!parseResult) return

    setIsLoading(true)
    setError(null)

    try {
      const matchedItems = parseResult.data
        .filter((item: ParsedItem) => item.matchedProduct)
        .map((item: ParsedItem) => ({
          csvTitle: item.csvTitle,
          productId: item.matchedProduct!.id,
          amazonCount: item.amazonCount,
          rakutenCount: item.rakutenCount,
          yahooCount: item.yahooCount,
          mercariCount: item.mercariCount,
          baseCount: item.baseCount,
          qoo10Count: item.qoo10Count
        }))

      if (matchedItems.length === 0) {
        setError('保存可能なデータがありません')
        return
      }

      const response = await fetch('/api/import/csv-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: matchedItems,
          month: parseResult.month
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'データ保存に失敗しました')
      }

      console.log('CSV保存成功:', result)
      setStep('complete')

    } catch (error) {
      console.error('CSV保存エラー:', error)
      setError(error instanceof Error ? error.message : 'データ保存中にエラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setStep('upload')
    setFile(null)
    setParseResult(null)
    setError(null)
    onClose()
  }

  const handleComplete = () => {
    handleClose()
    onSuccess()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">
            📊 汎用CSV取り込み（社内集計データ）
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4">
          {/* ステップインジケーター */}
          <div className="flex items-center justify-center mb-6">
            <div className={`flex items-center ${step === 'upload' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                1
              </div>
              <span className="ml-2 text-sm font-medium">ファイル選択</span>
            </div>
            <div className="flex-1 h-0.5 bg-gray-300 mx-4"></div>
            <div className={`flex items-center ${step === 'preview' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                2
              </div>
              <span className="ml-2 text-sm font-medium">プレビュー</span>
            </div>
            <div className="flex-1 h-0.5 bg-gray-300 mx-4"></div>
            <div className={`flex items-center ${step === 'complete' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'complete' ? 'bg-green-600 text-white' : 'bg-gray-300'}`}>
                3
              </div>
              <span className="ml-2 text-sm font-medium">完了</span>
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center">
              <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {/* Step 1: ファイル選択 */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  {/* 🆕 ボタン風ファイル選択 */}
                  <div className="relative inline-block">
                    <input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <button className="inline-flex items-center px-6 py-3 border-2 border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 font-medium transition-colors">
                      <FileText className="mr-2 h-5 w-5" />
                      CSVファイルを選択
                    </button>
                  </div>
                  {file && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex items-center justify-center">
                        <FileText className="h-5 w-5 text-green-600 mr-2" />
                        <span className="text-green-700 font-medium">{file.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-md">
                <h4 className="text-sm font-medium text-blue-900 mb-2">📋 CSV形式について</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• 社内で集計済みのEXCELデータを「CSV UTF-8」形式で保存してください</li>
                  <li>• 列構成: 商品名, 価格, Amazon, 楽天市場, Yahoo!, メルカリ, BASE, フロア, Qoo10, 合計, 売上</li>
                  <li>• 各ECサイトの数量が既に集計済みの状態で取り込みます</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={!file || isLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                >
                  {isLoading ? '解析中...' : 'アップロード'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: プレビュー */}
          {step === 'preview' && parseResult && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-md">
                <h4 className="text-sm font-medium text-green-900 mb-2">📊 解析結果</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-green-800">総件数: </span>
                    <span className="font-semibold">{parseResult.summary.total}件</span>
                  </div>
                  <div>
                    <span className="text-green-800">マッチ済み: </span>
                    <span className="font-semibold">{parseResult.summary.matched}件</span>
                  </div>
                  <div>
                    <span className="text-green-800">未マッチ: </span>
                    <span className="font-semibold">{parseResult.summary.unmatched}件</span>
                  </div>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto border rounded-md">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">商品名</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amazon</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">楽天</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Yahoo</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">メルカリ</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">BASE</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qoo10</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">マッチング</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parseResult.data.map((item: ParsedItem, index: number) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.csvTitle}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.amazonCount}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.rakutenCount}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.yahooCount}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.mercariCount}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.baseCount}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.qoo10Count}</td>
                        <td className="px-3 py-2">
                          {item.matchedProduct ? (
                            <div className="flex items-center">
                              <Check className="h-4 w-4 text-green-500 mr-1" />
                              <span className="text-sm text-green-700">{item.matchedProduct.name}</span>
                            </div>
                          ) : (
                            <select
                              value=""
                              onChange={(e) => handleManualMatch(index, e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1"
                            >
                              <option value="">手動選択...</option>
                              {products.map(product => (
                                <option key={product.id} value={product.id}>
                                  {product.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  戻る
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading || parseResult.summary.matched === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 完了 */}
          {step === 'complete' && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">取り込み完了！</h3>
              <p className="text-gray-600">
                CSVデータの取り込みが正常に完了しました。
              </p>
              <button
                onClick={handleComplete}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
