import { supabase } from "../lib/supabase"

export default function Login() {
  const handleSignIn = () =>
    supabase.auth.signInWithOAuth({ provider: "google" })
  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center pt-40">
      <div className="bg-white p-10 rounded shadow-md text-center space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">TSA 売上報告システム</h1>
        <p className="text-sm text-gray-500">Technical Staff AI System</p>
        <p className="text-gray-600">Googleアカウントでログインしてください</p>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded"
          onClick={handleSignIn}
        >
          Googleでログイン
        </button>
      </div>
    </div>
  )
}
