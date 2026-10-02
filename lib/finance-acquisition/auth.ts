import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function isFinanceAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === "aizubrandhall@gmail.com";
}

export function isSameOriginFinanceRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
