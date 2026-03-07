// /app/docs/rakuten-rpp-guide/page.tsx
// 楽天RPP広告 CSVエクスポートガイド
"use client"

import Image from "next/image"
import { ArrowLeft, Download, CheckCircle, AlertCircle, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"

export default function RakutenRPPGuidePage() {
    const router = useRouter()

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            <div className="max-w-4xl mx-auto px-6 py-10">
                {/* ヘッダー */}
                <div className="flex items-center gap-3 mb-8">
                    <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">楽天RPP広告 CSVエクスポートガイド</h1>
                        <p className="text-gray-500 text-sm mt-1">RMS パフォーマンスレポートからCSVをダウンロードする手順</p>
                    </div>
                </div>

                {/* 概要 */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-8">
                    <h2 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                        <AlertCircle size={18} /> はじめに
                    </h2>
                    <p className="text-sm text-red-700">
                        楽天RPP広告のパフォーマンスデータをCSVでダウンロードし、広告管理システムに取り込むための手順です。
                        月次で商品別のレポートをダウンロードしてください。
                    </p>
                </div>

                {/* ステップ1 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                        RMS にログイン → 広告メニューを開く
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① RMS（<a href="https://mainmenu.rms.rakuten.co.jp/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://mainmenu.rms.rakuten.co.jp/</a>）にログイン</p>
                        <p>② 左メニューの <strong>「広告・アフィリエイト・楽天大学」</strong> をクリック</p>
                        <p>③ サブメニューから <strong>「1 広告（プロモーションメニュー）」</strong> を選択</p>
                    </div>
                </div>

                {/* ステップ2 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                        検索連動型広告（RPP）を選択
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>広告メニュー画面で <strong>「検索連動型広告（RPP）」</strong> ボタンをクリック</p>
                    </div>
                </div>

                {/* ステップ3 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                        パフォーマンスレポートを開く
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>RPP管理画面の上部タブから <strong>「パフォーマンスレポート」</strong> をクリック</p>
                    </div>
                </div>

                {/* ステップ4 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                        レポート条件を設定してダウンロード
                    </h2>
                    <div className="space-y-4 text-sm text-gray-700">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="font-semibold mb-3 text-gray-800">設定内容</h3>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b">
                                        <td className="py-2 font-medium text-gray-600 w-36">集計単位</td>
                                        <td className="py-2"><strong>「商品別」</strong> を選択（商品ごとのパフォーマンスを取得）</td>
                                    </tr>
                                    <tr className="border-b">
                                        <td className="py-2 font-medium text-gray-600">集計期間</td>
                                        <td className="py-2"><strong>「月ごとに表示」</strong> を選択し、対象月の開始日〜末日を指定</td>
                                    </tr>
                                    <tr className="border-b">
                                        <td className="py-2 font-medium text-gray-600">絞り込み</td>
                                        <td className="py-2">キャンペーン: <strong>「全てのキャンペーン」</strong>、商品: <strong>「ランキング」</strong></td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-medium text-gray-600">表示/出力項目</td>
                                        <td className="py-2"><strong>「全てを選択」</strong> にチェック ✅</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="font-semibold mb-2 text-green-800 flex items-center gap-2">
                                <CheckCircle size={16} /> 出力される項目
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle size={12} className="text-green-600" /> クリック数
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle size={12} className="text-green-600" /> 実績額（広告費）
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle size={12} className="text-green-600" /> CPC（クリック単価）
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle size={12} className="text-green-600" /> 売上金額
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle size={12} className="text-green-600" /> ROAS
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle size={12} className="text-green-600" /> 売上件数
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle size={12} className="text-green-600" /> CVR
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle size={12} className="text-green-600" /> 注文獲得単価
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <Download size={20} className="text-red-600" />
                            <p><strong>「この条件でダウンロード」</strong> ボタンをクリックしてCSVを取得</p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-3">
                            <h3 className="font-semibold mb-1 text-amber-800">💡 ヒント</h3>
                            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                                <li>期間は <strong>3ヶ月以内</strong> に絞ってください（RMSの制限）</li>
                                <li>月次レポートの場合、<strong>月の1日〜末日</strong> を指定</li>
                                <li><strong>「全商品レポートダウンロード」</strong> ボタンでも一括取得可能</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* ステップ5 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                        広告管理システムにアップロード
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① <a href="/web-sales/advertising" className="text-blue-600 hover:underline">広告管理システム</a> を開く</p>
                        <p>② <strong>「楽天」</strong> タブを選択</p>
                        <p>③ <strong>「CSVアップロード」</strong> ボタンからダウンロードしたCSVを選択</p>
                        <p>④ データが自動的にパースされ、パフォーマンスが表示されます</p>
                        <p>⑤ <strong>「AI自動紐付け」</strong> でシリーズとの紐付けを実行</p>
                    </div>
                </div>

                {/* フッター */}
                <div className="text-center text-sm text-gray-400 pt-4">
                    <p>このガイドは楽天RPP広告のCSVエクスポート手順をまとめたものです。</p>
                    <p className="mt-1">RMSの仕様変更により画面が異なる場合があります。</p>
                </div>
            </div>
        </div>
    )
}
