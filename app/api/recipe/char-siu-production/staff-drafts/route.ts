import { managerDraftsGet, managerDraftsPost } from "@/lib/char-siu-staff-production-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const GET = managerDraftsGet;
export const POST = managerDraftsPost;
