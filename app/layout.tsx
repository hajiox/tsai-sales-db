// app/layout.tsx (テスト用コード1)

import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>
        <h1>こんにちは、世界！</h1>
        <main>
          {children}
        </main>
      </body>
    </html>
  )
}
