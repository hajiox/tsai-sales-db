import { managerPhoto } from "@/lib/char-siu-staff-production-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ draftId: string; photoId: string }> }) {
  const { draftId, photoId } = await context.params;
  return managerPhoto(request, draftId, photoId);
}
