// app/layout.tsx (認証解除テスト用)

import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* 全てのラッパーを外し、ページの中身だけを表示する */}
        {children}
      </body>
    </html>
  )
}
