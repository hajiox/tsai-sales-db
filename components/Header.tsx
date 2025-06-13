"use client";
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export default function Header() {
  const { data: session } = useSession()

  return (
    <header className="w-full bg-gray-900 text-white p-4 flex items-center justify-between">
      <h1 className="text-lg font-semibold">売上報告システム</h1>
      {session && (
        <div className="flex items-center gap-2">
          <span className="text-sm">{session.user.name}</span>
          <Button
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-full shadow-sm hover:bg-gray-700 hover:text-white transition"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      )}
    </header>
  )
}
