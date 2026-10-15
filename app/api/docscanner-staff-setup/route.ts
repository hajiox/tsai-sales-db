import {
  DOCSCANNER_STAFF_SETUP_HEADERS,
  loadDocscannerStaffCertificate,
  renderDocscannerStaffSetupPage,
  renderDocscannerStaffSetupUnavailable,
} from "@/lib/docscanner-staff-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const certificate = await loadDocscannerStaffCertificate();
  return new Response(certificate ? renderDocscannerStaffSetupPage(certificate) : renderDocscannerStaffSetupUnavailable(), {
    status: certificate ? 200 : 503,
    headers: { ...DOCSCANNER_STAFF_SETUP_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
