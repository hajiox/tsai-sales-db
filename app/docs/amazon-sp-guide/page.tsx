// /app/docs/amazon-sp-guide/page.tsx
// Amazon スポンサープロダクト広告 CSVエクスポートガイド — 統一デザイン
"use client"

import { ArrowLeft, Download, CheckCircle, AlertCircle, ExternalLink } from "lucide-react"

export default function AmazonSPGuidePage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            <div className="max-w-4xl mx-auto px-6 py-10">
                {/* ヘッダー */}
                <div className="flex items-center gap-3 mb-8">
                    <a href="/web-sales/advertising" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                        <ArrowLeft size={20} />
                    </a>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Amazon スポンサープロダクト広告 CSVエクスポートガイド</h1>
                        <p className="text-gray-500 text-sm mt-1">Amazon Advertisingからパフォーマンスレポートをダウンロードする手順</p>
                    </div>
                </div>

                {/* 概要 */}
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-8">
                    <h2 className="font-semibold text-orange-800 mb-2 flex items-center gap-2">
                        <AlertCircle size={18} /> はじめに
                    </h2>
                    <p className="text-sm text-orange-700">
                        Amazon スポンサープロダクト広告のパフォーマンスデータをCSVでダウンロードし、TSAシステムに取り込む手順です。
                        「広告対象商品」レポートを月次でダウンロードしてください。
                    </p>
                </div>

                {/* STEP 1 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                        Amazon Advertising にログイン → レポート画面を開く
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① <a href="https://advertising.amazon.co.jp/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Amazon Advertising <ExternalLink size={12} /></a> にログイン</p>
                        <p>② 左サイドバーの <strong>📊 効果測定とレポート</strong>（グラフアイコン）をクリック</p>
                        <p>③ サブメニューから <strong>「スポンサー広告レポート」</strong> を選択</p>
                        <div className="bg-gray-50 rounded-lg p-3 mt-2">
                            <p className="text-xs text-gray-500">💡 左サイドバーの下の方にあるグラフ📊のアイコンです。クリックするとサブメニューが展開されます。</p>
                        </div>
                    </div>
                </div>

                {/* STEP 2 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                        「レポートを作成」をクリック
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>レポート一覧画面の左上にある <strong>「レポートを作成」</strong> ボタン（青いボタン）をクリック</p>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">過去に作成したレポートがある場合は一覧に表示されます。新規で作成してください。</p>
                        </div>
                    </div>
                </div>

                {/* STEP 3 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                        レポートの構成を設定
                    </h2>
                    <div className="space-y-4 text-sm text-gray-700">
                        <p>「新規レポート」画面の <strong>「構成」</strong>セクションで以下の通り設定してください。</p>

                        <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="font-semibold mb-3 text-gray-800">構成の設定内容</h3>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b">
                                        <td className="py-2 font-medium text-gray-600 w-40">レポートカテゴリー</td>
                                        <td className="py-2"><strong>「スポンサープロダクト広告」</strong> を選択</td>
                                    </tr>
                                    <tr className="border-b">
                                        <td className="py-2 font-medium text-gray-600">レポートタイプ</td>
                                        <td className="py-2">
                                            <strong>「広告対象商品」</strong> を選択（ドロップダウン）
                                            <div className="text-xs text-gray-500 mt-1">※ これによりASIN/SKUごとの実績が取得できます</div>
                                        </td>
                                    </tr>
                                    <tr className="border-b">
                                        <td className="py-2 font-medium text-gray-600">時間単位</td>
                                        <td className="py-2">
                                            <strong>「概要」</strong> を選択（ラジオボタン）
                                            <div className="text-xs text-gray-500 mt-1">※ 月全体のサマリーが1行ずつ出力されます</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-medium text-gray-600">レポート期間</td>
                                        <td className="py-2">
                                            <strong>「先月」</strong> または対象月の日付範囲を指定
                                            <div className="text-xs text-gray-500 mt-1">※ カレンダーから 1日〜末日 を指定しても可</div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <h3 className="font-semibold mb-1 text-amber-800">⚠️ 重要: レポートタイプについて</h3>
                            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                                <li>デフォルトは「検索用語」になっています。必ず <strong>「広告対象商品」</strong> に変更してください</li>
                                <li>「検索用語」ではASIN/商品名が取得できません</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* STEP 4 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                        レポートを実行 → ダウンロード
                    </h2>
                    <div className="space-y-4 text-sm text-gray-700">
                        <p>① 画面右上の <strong>「レポートを実行」</strong> ボタンをクリック</p>
                        <p>② レポート一覧画面に戻ります。ステータスが <strong>「完了」</strong>（✓チェック）になるまで待機（通常1分以内）</p>
                        <div className="flex items-center gap-3 pt-1">
                            <Download size={20} className="text-orange-500" />
                            <p>③ 完了後、右端の <strong>ダウンロードアイコン（⬇️）</strong> をクリックしてCSVを保存</p>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="font-semibold mb-2 text-green-800 flex items-center gap-2">
                                <CheckCircle size={16} /> 出力される主要項目
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                                {['キャンペーン名', 'SKU', 'ASIN', 'インプレッション', 'クリック数', 'CPC', '広告費（合計費用）', '売上', '注文数', 'ACOS', 'ROAS'].map(item => (
                                    <div key={item} className="flex items-center gap-1.5">
                                        <CheckCircle size={12} className="text-green-600" /> {item}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <h3 className="font-semibold mb-1 text-amber-800">💡 ヒント</h3>
                            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                                <li><strong>月ごと</strong>に1ファイルずつダウンロードしてください</li>
                                <li>CSVファイルの文字コードは <strong>UTF-8</strong> です（そのままアップロード可能）</li>
                                <li>ファイル名は変更しても問題ありません</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* STEP 5 */}
                <div className="bg-white border rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        <span className="bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                        TSAシステムにアップロード
                    </h2>
                    <div className="space-y-3 text-sm text-gray-700">
                        <p>① <a href="/web-sales/advertising" className="text-blue-600 hover:underline">広告管理システム</a> を開く</p>
                        <p>② <strong>「Amazon広告」</strong> タブを選択</p>
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
                        <li>レポートタイプは必ず <strong>「広告対象商品」</strong> を選択してください（デフォルトの「検索用語」ではNG）</li>
                        <li>スポンサーブランド広告やディスプレイ広告は別レポートです。まずはスポンサープロダクト広告のみ対応</li>
                        <li>Amazon Advertisingの仕様変更により画面が異なる場合があります</li>
                        <li>レポートの生成には数秒〜1分程度かかります。ステータスが「完了」になってからダウンロードしてください</li>
                    </ul>
                </div>

                {/* フッター */}
                <div className="text-center text-sm text-gray-400 pt-6 mt-6 border-t">
                    TSA System — Amazon スポンサープロダクト広告 CSVインポートガイド
                </div>
            </div>
        </div>
    )
}
