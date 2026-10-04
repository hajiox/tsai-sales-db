// Compatibility for previously installed DocScanner callers. Accounting ABC
// mail always belongs to 食のブランド館分析; never write the retail-store table.
import { POST as importFoodStoreMail } from "@/app/api/food-store/mail-import/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = importFoodStoreMail;
