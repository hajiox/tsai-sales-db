import { handleDataAccess } from "@/lib/data-access/server";
export const runtime = "nodejs";
export async function POST(request: Request) { return handleDataAccess(request, "prepare"); }
