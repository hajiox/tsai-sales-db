"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { signIn, useSession } from "next-auth/react"

export default function Login() {
  const { data: session } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session) router.replace("/dashboard")
  }, [session, router])

  return (
    <div className="flex min-h-screen items-start justify-center pt-20 bg-gray-100">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="mb-2 text-center text-2xl font-bold">TSAログイン画面</h1>
        <p className="mb-6 text-center text-sm text-gray-500">Technical Staff AI System</p>
        <p className="mb-4 text-center">Googleアカウントでログインしてください</p>
        <div className="flex justify-center">
          <button
            className="rounded bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
            onClick={() => signIn("google")}
          >
            Googleでログイン
          </button>
        </div>
      </div>
    </div>
  )
}
