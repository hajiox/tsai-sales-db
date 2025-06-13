'use client'

import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut()}
      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-full shadow-sm hover:bg-gray-700 hover:text-white transition"
    >
      <LogOut size={16} />
      ログアウト
    </button>
  )
}
