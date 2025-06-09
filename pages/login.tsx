import { useRouter } from "next/router"
import { supabase } from "../lib/supabase"

export default function Login() {
  const router = useRouter()
  const handleSignIn = () =>
    supabase.auth.signInWithOAuth({ provider: "google" })
  return (
    <div className="h-screen flex items-center justify-center">
      <button
        className="px-6 py-3 bg-blue-600 text-white rounded"
        onClick={handleSignIn}
      >
        Google でログイン
      </button>
    </div>
  )
}
