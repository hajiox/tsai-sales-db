// /app/docs/meta-csv-guide/page.tsx
// Meta広告 CSVエクスポートガイド — 統一デザイン
"use client"

import { ArrowLeft, CheckCircle, AlertCircle, Download, ExternalLink, FileText } from "lucide-react"

export default function MetaCsvGuidePage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            <div className="max-w-4xl mx-auto px-6 py-10">
                {/* ヘッダー */}
                <div className="flex items-center gap-3 mb-8">
                    <a href="/web-sales/advertising" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                        <ArrowLeft size={20} />
                    </a>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Meta広告 CSVエクスポートガイド</h1>
                        <p className="text-gray-500 text-sm mt-1">Meta広告マネージャからCSVをエクスポートし、TSAシステムに取り込む手順</p>
                    </div>
                </div>

                {/* 概要 */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-8">
                    <h2 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                        <AlertCircle size={18} /> はじめに
                    </h2>
                    <p className="text-sm text-blue-700">
                        Meta広告マネージャから広告セット単位のパフォーマンスデータをCSVエクスポートし、TSAシステムに取り込む手順です。
                        月次で広告セットレベルのレポートをエクスポートしてください。
                    </p>
                </div>

                {/* STEP 1 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                        広告マネージャを開く
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① <a href="https://adsmanager.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Meta広告マネージャ</a> にアクセスしてログイン</p>
                        <p>② <strong>「キャンペーン」タブ</strong>が選択されていることを確認</p>
                    </div>
                </div>

                {/* STEP 2 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                        期間を設定する
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>画面右上の <strong>日付範囲セレクター</strong> をクリックし、取り込みたい月の範囲を設定</p>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <h3 className="font-semibold mb-1 text-amber-800">💡 ヒント</h3>
                            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                                <li>期間は<strong>月単位</strong>で指定（例：2026/02/01 〜 2026/02/28）</li>
                                <li>1ファイル = 1ヶ月分でエクスポートしてください</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* STEP 3 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                        表示レベルを「広告セット」に切り替え
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>タブを <strong>「広告セット」</strong> に切り替え</p>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm text-blue-700">💡 広告セット名に商品やシリーズ名が含まれるため、TSA側でのAI自動紐付けが容易になります</p>
                        </div>
                    </div>
                </div>

                {/* STEP 4 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                        列をカスタマイズ（初回のみ）
                    </h2>
                    <div className="space-y-4 text-sm text-gray-700">
                        <p><strong>「列: パフォーマンス」</strong> → <strong>「列をカスタマイズ」</strong> を選択して以下にチェック</p>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="font-semibold mb-3 text-gray-800">チェック項目</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {['消化金額', 'インプレッション', 'リーチ', 'フリークエンシー', 'CPM', 'クリック(すべて)', 'リンクのクリック', 'CTR(すべて)', 'CPC(すべて)', '結果', '結果の単価', '結果レート'].map(item => (
                                    <div key={item} className="flex items-center gap-1.5">
                                        <CheckCircle size={12} className="text-green-600" /> {item}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">※ キャンペーン名・広告セット名・配信はデフォルトで含まれます。設定後「適用」をクリック。次回以降は保存されます。</p>
                    </div>
                </div>

                {/* STEP 5 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                        CSVとしてエクスポート
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p><strong>「エクスポート」▼</strong> → <strong>「.csvファイルとしてエクスポート」</strong> を選択</p>
                        <div className="flex items-center gap-3 pt-2">
                            <Download size={20} className="text-blue-600" />
                            <p>CSVファイルがダウンロードされます</p>
                        </div>
                    </div>
                </div>

                {/* STEP 6 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">6</span>
                        TSAシステムにアップロード
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① <a href="/web-sales/advertising" className="text-blue-600 hover:underline">広告管理システム</a> を開く</p>
                        <p>② <strong>「Meta広告」</strong> タブを選択</p>
                        <p>③ <strong>「CSVアップロード」</strong> ボタンからダウンロードしたCSVを選択</p>
                        <p>④ データが自動的にパースされ、パフォーマンスが表示されます</p>
                        <p>⑤ <strong>「AI自動紐付け」</strong> でシリーズとの紐付けを実行</p>
                    </div>
                </div>

                {/* 注意事項 */}
                <div className="bg-gray-50 border rounded-xl p-5 space-y-3">
                    <h2 className="font-semibold flex items-center gap-2">
                        <AlertCircle size={16} /> 注意事項
                    </h2>
                    <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
                        <li>CSVのエンコーディングはUTF-8推奨。Excelで再保存する場合は文字化けに注意</li>
                        <li>エクスポートは<strong>月ごと</strong>に実施（1ファイル = 1ヶ月分）</li>
                        <li>列カスタマイズは初回設定後、自動的に同じ設定が適用されます</li>
                    </ul>
                </div>

                {/* フッター */}
                <div className="text-center text-sm text-gray-400 pt-6 mt-6 border-t">
                    TSA System — Meta広告 CSVインポートガイド
                </div>
            </div>
        </div>
    )
}
