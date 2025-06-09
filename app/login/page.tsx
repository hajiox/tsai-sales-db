'use client'
import { supabase } from '@/lib/supabase'

export default function Login() {
  return (
    <div className="flex h-screen items-center justify-center">
      <button
        className="rounded bg-black px-6 py-3 text-white"
        onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
      >
        Google でログイン
      </button>
    </div>
  )
}
