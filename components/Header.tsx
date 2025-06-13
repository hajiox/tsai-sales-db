'use client'

import LogoutButton from './LogoutButton'
import { useSession } from 'next-auth/react'

export default function Header() {
  const { data: session } = useSession()

  return (
    <header className="flex justify-between items-center px-4 py-2 border-b border-gray-200 bg-white">
      <h1 className="text-lg font-bold text-blue-600">売上報告システム</h1>
      <div className="flex items-center gap-4">
        {session?.user?.name && (
          <span className="text-sm text-gray-700">{session.user.name}</span>
        )}
        <LogoutButton />
      </div>
    </header>
  )
}
