import { handleDataAccess } from "@/lib/data-access/server";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleDataAccess(request, "apply", id);
}
