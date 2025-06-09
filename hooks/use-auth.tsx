import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { isAllowed } from "../lib/supabase"

export const useAuth = () => {
  const [user, setUser] = useState<any>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || !isAllowed(data.user.email)) {
        supabase.auth.signOut()
        location.href = "/login"
      } else {
        setUser(data.user)
      }
    })
  }, [])
  return user
}
