"use client";
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function Header() {
  return (
    <header className="w-full bg-gray-900 text-white p-4 flex items-center justify-between">
      <h1 className="text-lg font-semibold">売上報告システム</h1>
      <Button variant="secondary" onClick={() => signOut({ callbackUrl: '/' })}>
        ログアウト
      </Button>
    </header>
  )
}
