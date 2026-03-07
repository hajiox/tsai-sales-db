// Meta広告 CSVエクスポートガイド
export default function MetaCsvGuidePage() {
    return (
        <div className="max-w-4xl mx-auto py-10 px-6 space-y-10">
            <header>
                <h1 className="text-3xl font-bold mb-2">📋 Meta広告 CSVエクスポートガイド</h1>
                <p className="text-gray-600">Meta広告マネージャからCSVをエクスポートし、TSAシステムに取り込む手順です。</p>
            </header>

            {/* STEP 1 */}
            <section className="space-y-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">1</span>
                    広告マネージャを開く
                </h2>
                <div className="space-y-3 text-gray-700">
                    <p>
                        <a href="https://adsmanager.facebook.com/" target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 underline font-medium">Meta広告マネージャ</a> にアクセスしてログインします。
                    </p>
                    <p>キャンペーン一覧が表示されます。<strong>「キャンペーン」タブ</strong>が選択されていることを確認してください。</p>
                </div>
                <div className="border rounded-lg overflow-hidden shadow-sm">
                    <img src="/docs/meta-csv-guide/step1_overview.png" alt="キャンペーン一覧" className="w-full" />
                </div>
            </section>

            {/* STEP 2 */}
            <section className="space-y-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">2</span>
                    期間を設定する
                </h2>
                <div className="space-y-3 text-gray-700">
                    <p>画面右上の <strong>日付範囲セレクター</strong>（例：「過去30日間: 2026/02/04 〜 2026/03/05」）をクリックします。</p>
                    <p>取り込みたい月の範囲を設定します。</p>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="font-medium text-amber-800">⚠️ 重要：期間は月単位で指定</p>
                        <p className="text-amber-700 text-sm mt-1">例：2026年2月分を取り込む場合 → <code className="bg-amber-100 px-1 rounded">2026/02/01 〜 2026/02/28</code></p>
                    </div>
                </div>
            </section>

            {/* STEP 3 */}
            <section className="space-y-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">3</span>
                    表示レベルを「広告セット」に切り替え
                </h2>
                <div className="space-y-3 text-gray-700">
                    <p>タブを <strong>「広告セット」</strong> に切り替えます。これによりキャンペーン配下の広告セット単位のデータがエクスポートされます。</p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="font-medium text-blue-800">💡 なぜ広告セット単位？</p>
                        <p className="text-blue-700 text-sm mt-1">広告セット名に商品やシリーズ名が含まれるため、TSAシステムでの商品グループ紐付けが容易になります。</p>
                    </div>
                </div>
            </section>

            {/* STEP 4 */}
            <section className="space-y-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">4</span>
                    列をカスタマイズ（初回のみ）
                </h2>
                <div className="space-y-3 text-gray-700">
                    <p>ツールバーの <strong>「列: パフォーマンス」</strong> ボタンをクリックし、ドロップダウン下部の <strong>「列をカスタマイズ」</strong> を選択します。</p>
                </div>
                <div className="border rounded-lg overflow-hidden shadow-sm">
                    <img src="/docs/meta-csv-guide/step2_columns.png" alt="列プリセット選択" className="w-full" />
                </div>
                <div className="space-y-3 text-gray-700 mt-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="font-medium text-blue-800">💡 キャンペーン名・広告セット名・配信について</p>
                        <p className="text-blue-700 text-sm mt-1">これらは広告セットレベルの場合デフォルトで表示されるため、列カスタマイズでチェックする必要はありません。</p>
                    </div>
                    <p>列カスタマイズ画面で、以下の項目にチェックを入れてください：</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-bold text-sm text-gray-800 mb-2">💰 費用・パフォーマンス</h4>
                            <ul className="text-sm space-y-1 text-gray-600">
                                <li>✅ 消化金額</li>
                                <li>✅ インプレッション</li>
                                <li>✅ リーチ</li>
                                <li>✅ フリークエンシー</li>
                                <li>✅ CPM</li>
                            </ul>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-bold text-sm text-gray-800 mb-2">🖱️ エンゲージメント</h4>
                            <ul className="text-sm space-y-1 text-gray-600">
                                <li>✅ クリック（すべて）</li>
                                <li>✅ リンクのクリック</li>
                                <li>✅ CTR（すべて）</li>
                                <li>✅ CPC（すべて）</li>
                            </ul>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 col-span-2">
                            <h4 className="font-bold text-sm text-gray-800 mb-2">🎯 結果</h4>
                            <ul className="text-sm space-y-1 text-gray-600 grid grid-cols-3">
                                <li>✅ 結果</li>
                                <li>✅ 結果の単価</li>
                                <li>✅ 結果レート</li>
                            </ul>
                        </div>
                    </div>
                    <p className="text-sm text-gray-500">※ 設定後「適用」をクリック。次回以降は保存されます。</p>
                </div>
                <div className="border rounded-lg overflow-hidden shadow-sm">
                    <img src="/docs/meta-csv-guide/step3_customize.png" alt="列カスタマイズダイアログ" className="w-full" />
                </div>
            </section>

            {/* STEP 5 */}
            <section className="space-y-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">5</span>
                    CSVとしてエクスポート
                </h2>
                <div className="space-y-3 text-gray-700">
                    <p>ツールバーの <strong>「エクスポート」</strong> ボタン右側の <strong>▼</strong> をクリックし、<strong>「.csvファイルとしてエクスポート」</strong> を選択します。</p>
                </div>
                <div className="border rounded-lg overflow-hidden shadow-sm">
                    <img src="/docs/meta-csv-guide/step4_export.png" alt="CSVエクスポートメニュー" className="w-full" />
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-3">
                    <p className="font-medium text-green-800">✅ CSVファイルがダウンロードされます</p>
                    <p className="text-green-700 text-sm mt-1">ダウンロードしたCSVファイルを、TSAシステムの広告管理 → Meta広告タブからアップロードして取り込みます。</p>
                </div>
            </section>

            {/* 注意事項 */}
            <section className="bg-gray-50 rounded-xl p-6 space-y-3">
                <h2 className="text-lg font-bold">📌 注意事項</h2>
                <ul className="text-sm text-gray-700 space-y-2">
                    <li>• CSVのエンコーディングはUTF-8が推奨です。Excelで開いて再保存する場合は文字化けに注意してください。</li>
                    <li>• エクスポートは<strong>月ごと</strong>に行ってください（1ファイル = 1ヶ月分）。</li>
                    <li>• 「広告セット」レベルでエクスポートすると、各広告セットの名前から商品シリーズを自動マッチングします。</li>
                    <li>• 列カスタマイズは初回設定後、次回以降は自動的に同じ設定が適用されます。</li>
                </ul>
            </section>

            <footer className="text-center text-sm text-gray-400 pt-6 border-t">
                TSA System — Meta広告CSVインポートガイド
            </footer>
        </div>
    )
}
