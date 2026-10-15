import {
  DOCSCANNER_STAFF_SETUP_HEADERS,
  renderDocscannerStaffSetupPage,
} from "@/lib/docscanner-staff-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(renderDocscannerStaffSetupPage(), {
    status: 200,
    headers: { ...DOCSCANNER_STAFF_SETUP_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
