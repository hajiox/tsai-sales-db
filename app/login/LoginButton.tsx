"use client"
import { signIn } from "next-auth/react"
export default function LoginButton() {
  return (
    <button
      className="rounded bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
      onClick={() => signIn("google", { callbackUrl: "/sales/dashboard" })}
    >
      Googleでログイン
    </button>
  )
}
