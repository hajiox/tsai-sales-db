import WebSalesDashboard from "@/components/websales-dashboard"

// 静的生成を無効化して動的レンダリングを強制
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * WEB販売管理システムのページ
 * このコンポーネントの役割は、ダッシュボードの本体を呼び出すことだけです。
 * 実際のレイアウトは、上位の main-dashboard.tsx が担当します。
 */
export default function WebSalesDashboardPage() {
  return <WebSalesDashboard />
}
