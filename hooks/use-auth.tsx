"use client"
import { useSession } from "next-auth/react"

export const useAuth = () => {
  const { data: session } = useSession()
  return session?.user ?? null
}
