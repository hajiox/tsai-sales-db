'use client'

export default function WebSalesDashboard() {
  console.log('ページ読み込み開始')
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold">最小テストページ</h1>
      <p>このページが表示されれば基本的な動作は正常です</p>
      <div className="mt-4 p-4 bg-white rounded border">
        <p>現在時刻: {new Date().toLocaleString()}</p>
      </div>
    </div>
  )
}
