import { redirect } from "next/navigation"
import { headers } from "next/headers"

export default async function Page() {
  const userAgent = (await headers()).get("user-agent") || ""
  const isMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(userAgent)
  redirect(isMobile ? "/mobile" : "/sales/dashboard")
  return null
}
