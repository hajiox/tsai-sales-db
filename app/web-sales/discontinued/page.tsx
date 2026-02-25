// app/web-sales/discontinued/page.tsx
import DiscontinuedClient from "./page.client"

// ブラウザ専用Supabaseクライアントをビルド時プリレンダリングから除外
export const dynamic = "force-dynamic"

export default function DiscontinuedPage() {
    return <DiscontinuedClient />
}
