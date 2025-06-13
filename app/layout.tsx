import './globals.css'
import Header from '@/components/Header'
import { Providers } from './providers'

export const metadata = {
  title: '売上報告システム',
  description: '帳票の分析と集計',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <Providers>
          <Header />
          <main className="p-4">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
