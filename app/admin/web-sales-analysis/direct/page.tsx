import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import DirectAnalysisForm from "./direct-analysis-form";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";

export default async function DirectWebSalesAnalysisPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return <main className="mx-auto max-w-3xl p-8">管理者ログインが必要です。</main>;
  }
  return <DirectAnalysisForm />;
}
