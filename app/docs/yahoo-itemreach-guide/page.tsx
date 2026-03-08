// /app/docs/yahoo-itemreach-guide/page.tsx
// Yahoo!ショッピング アイテムリーチ広告 CSVエクスポートガイド — 統一デザイン
"use client"

import { ArrowLeft, Download, CheckCircle, AlertCircle, ExternalLink, FileText } from "lucide-react"

export default function YahooItemReachGuidePage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            <div className="max-w-4xl mx-auto px-6 py-10">
                {/* ヘッダー */}
                <div className="flex items-center gap-3 mb-8">
                    <a href="/web-sales/advertising" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                        <ArrowLeft size={20} />
                    </a>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Yahoo!ショッピング アイテムリーチ広告 CSVエクスポートガイド</h1>
                        <p className="text-gray-500 text-sm mt-1">コマースアドマネージャーからパフォーマンスレポートをCSVダウンロードする手順</p>
                    </div>
                </div>

                {/* 概要 */}
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-8">
                    <h2 className="font-semibold text-purple-800 mb-2 flex items-center gap-2">
                        <AlertCircle size={18} /> はじめに
                    </h2>
                    <p className="text-sm text-purple-700">
                        Yahoo!ショッピングのアイテムリーチ広告（旧アイテムマッチ）のパフォーマンスデータをCSVでダウンロードし、TSAシステムに取り込む手順です。
                        コマースアドマネージャーから月次レポートをダウンロードしてください。
                    </p>
                </div>

                {/* STEP 1 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                        ストアクリエイターPro にログイン
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① <a href="https://pro.store.yahoo.co.jp/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">ストアクリエイターPro <ExternalLink size={12} /></a> にログイン</p>
                        <p>② トップページの <strong>「集客・販促」</strong> メニューをクリック</p>
                        <p>③ <strong>「コマースアドマネージャー」</strong> をクリックして広告管理画面を開く</p>
                    </div>
                </div>

                {/* STEP 2 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                        「実績・明細」→「広告詳細レポート」タブを開く
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① コマースアドマネージャー上部メニューから <strong>「実績・明細」</strong> をクリック</p>
                        <p>② 表示される3つのタブから <strong>「広告詳細レポート」</strong> タブを選択</p>
                        <div className="bg-gray-50 rounded-lg p-4 mt-2">
                            <h3 className="font-semibold mb-2 text-gray-800">タブ一覧</h3>
                            <div className="flex gap-6 text-sm">
                                <span className="text-gray-500">アカウント分析</span>
                                <span className="text-purple-700 font-bold border-b-2 border-purple-600 pb-1">広告詳細レポート ⭐</span>
                                <span className="text-gray-500">請求・利用明細</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* STEP 3 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                        レポート条件を設定してCSVダウンロード
                    </h2>
                    <div className="space-y-4 text-sm text-gray-700">
                        <p>広告詳細レポート画面で以下を設定し、ダウンロードします。</p>

                        <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="font-semibold mb-3 text-gray-800">設定内容</h3>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b">
                                        <td className="py-2 font-medium text-gray-600 w-36">レポート種類</td>
                                        <td className="py-2">
                                            <strong>「商品別」</strong> を選択（ラジオボタン）
                                            <div className="text-xs text-gray-500 mt-1">※ 他に「検索キーワード別×商品別」「配信カテゴリ別」がありますが商品別を選択</div>
                                        </td>
                                    </tr>
                                    <tr className="border-b">
                                        <td className="py-2 font-medium text-gray-600">集計単位</td>
                                        <td className="py-2">
                                            <strong>「月別」</strong> を選択（ラジオボタン）
                                            <div className="text-xs text-gray-500 mt-1">※ 「日別」でも可ですが月別を推奨</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-medium text-gray-600">集計期間</td>
                                        <td className="py-2">対象の <strong>年月（例: 2026/02）</strong> を選択</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <Download size={20} className="text-purple-600" />
                            <p>設定後、<strong>「CSVファイルをダウンロード」</strong> ボタンをクリック</p>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="font-semibold mb-2 text-green-800 flex items-center gap-2">
                                <CheckCircle size={16} /> 出力される主要項目
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                                {['商品コード', '商品名', 'インプレッション数', 'クリック数', 'CPC', '広告費（利用金額）', '注文数', '売上金額', 'ROAS', 'CVR'].map(item => (
                                    <div key={item} className="flex items-center gap-1.5">
                                        <CheckCircle size={12} className="text-green-600" /> {item}
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-green-600 mt-2">※ 金額表記は「売上金額」のみ取込、それ以外は税抜</p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <h3 className="font-semibold mb-1 text-amber-800">💡 ヒント</h3>
                            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                                <li><strong>月ごと</strong>に1ファイルずつダウンロードしてください</li>
                                <li>CSVファイルの文字コードは <strong>UTF-8</strong> または <strong>Shift-JIS</strong> の場合があります（システム側で自動判定）</li>
                                <li>ファイル名は変更しても問題ありません</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* STEP 5 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                        TSAシステムにアップロード
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① <a href="/web-sales/advertising" className="text-blue-600 hover:underline">広告管理システム</a> を開く</p>
                        <p>② <strong>「Yahoo!広告」</strong> タブを選択</p>
                        <p>③ <strong>「CSVアップロード」</strong> ボタンからダウンロードしたCSVファイルを選択</p>
                        <p>④ データが自動的にパースされ、パフォーマンスが表示されます</p>
                        <p>⑤ <strong>「AI自動紐付け」</strong> でシリーズとの紐付けを実行</p>
                        <p>⑥ 紐付け確認後、<strong>「広告費取り込み」</strong> でダッシュボードに反映</p>
                    </div>
                </div>

                {/* 注意事項 */}
                <div className="bg-gray-50 border rounded-xl p-5 space-y-3">
                    <h2 className="font-semibold flex items-center gap-2">
                        <AlertCircle size={16} /> 注意事項
                    </h2>
                    <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
                        <li>2025年8月以降、「ストアマッチ（アイテムマッチ）」は「コマースアドマネージャー（アイテムリーチ）」に移行しています</li>
                        <li>CSVの文字コードは自動判定されますが、文字化けが発生した場合はお知らせください</li>
                        <li>コマースアドマネージャーの仕様変更により画面が異なる場合があります</li>
                        <li>初回利用時は利用規約への同意が必要な場合があります</li>
                    </ul>
                </div>

                {/* フッター */}
                <div className="text-center text-sm text-gray-400 pt-6 mt-6 border-t">
                    TSA System — Yahoo!ショッピング アイテムリーチ広告 CSVインポートガイド
                </div>
            </div>
        </div>
    )
}
