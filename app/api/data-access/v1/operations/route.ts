import { handleBusinessOperations } from "@/lib/data-access/operation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleBusinessOperations;
