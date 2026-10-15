import {
  DOCSCANNER_STAFF_CERTIFICATE_FILENAME,
  DOCSCANNER_STAFF_SETUP_HEADERS,
  DOCSCANNER_STAFF_SETUP_UNAVAILABLE,
  loadDocscannerStaffCertificate,
} from "@/lib/docscanner-staff-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const certificate = await loadDocscannerStaffCertificate();
  if (!certificate) {
    return new Response(DOCSCANNER_STAFF_SETUP_UNAVAILABLE, {
      status: 503,
      headers: { ...DOCSCANNER_STAFF_SETUP_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(new Uint8Array(certificate.der), {
    headers: {
      ...DOCSCANNER_STAFF_SETUP_HEADERS,
      "Content-Type": "application/pkix-cert",
      "Content-Disposition": `attachment; filename="${DOCSCANNER_STAFF_CERTIFICATE_FILENAME}"`,
    },
  });
}
