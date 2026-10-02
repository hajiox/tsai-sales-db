import { isFinanceAdmin } from "@/lib/finance-acquisition/auth";
import ConnectionForm from "./form";
export default async function Page() {
  if (!await isFinanceAdmin()) return <main className="p-8">管理者ログインが必要です。</main>;
  return <main className="mx-auto max-w-4xl space-y-6 p-6"><a className="text-blue-700 underline" href="/web-sales/automation">取得管理に戻る</a>
    <h1 className="text-2xl font-bold">EC・広告のAPI接続</h1>
    <p className="text-sm text-gray-600">接続済みの鍵は表示しません。変更する項目だけ入力してください。保存後の取得で、アカウント・期間・金額を確認します。</p>
    <ConnectionForm /></main>;
}
