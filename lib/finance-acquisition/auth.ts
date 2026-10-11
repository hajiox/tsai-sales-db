import { getBusinessAdminSession, isBusinessAdminSession } from "@/lib/data-access/business-operation-context";

export async function isFinanceAdmin(): Promise<boolean> {
  return isBusinessAdminSession(await getBusinessAdminSession());
}

export function isSameOriginFinanceRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
