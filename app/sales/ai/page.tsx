import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// "YYYY-MM" 形式の月を "YYYY年M月" 形式に変換
const formatMonth = (month: string | null): string => {
  if (!month) return "日付不明";
  const [year, monthNum] = month.split("-");
  return `${year}年${parseInt(monthNum, 10)}月`;
};

// レポート内容を解析して表示するコンポーネント
const ReportContent = ({ content }: { content: string | null }) => {
  if (!content) {
    return <p className="text-slate-500">レポート内容がありません。</p>;
  }

  try {
    const parsed = JSON.parse(content);
    // 4つのキーがすべて存在するかチェック
    if (parsed.summary && parsed.compare_recent && parsed.compare_last_year && parsed.top3) {
      return (
        <div className="space-y-8 text-slate-700">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2 pb-1 border-b-2 border-slate-200">当月簡易分析</h3>
            <p className="whitespace-pre-wrap">{parsed.summary}</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2 pb-1 border-b-2 border-slate-200">前月・前々月比較</h3>
            <p className="whitespace-pre-wrap">{parsed.compare_recent}</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2 pb-1 border-b-2 border-slate-200">前年同月比較</h3>
            <p className="whitespace-pre-wrap">{parsed.compare_last_year}</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2 pb-1 border-b-2 border-slate-200">特異日ベスト3</h3>
            <p className="whitespace-pre-wrap">{parsed.top3}</p>
          </div>
        </div>
      );
    }
  } catch (e) {
    // JSONの解析に失敗した場合(古いデータ等)は、そのままテキストとして表示
    return <p className="whitespace-pre-wrap">{content}</p>;
  }
  // JSONではあるが期待した形式でない場合も、そのまま表示
  return <p className="whitespace-pre-wrap">{content}</p>;
};


export default async function AiReportsPage() {
  const supabase = createServerComponentClient({ cookies });
  const { data: reports, error } = await supabase
    .from("ai_reports")
    .select("month, content, created_at")
    .order("month", { ascending: false });

  if (error) {
    console.error("AIレポートの取得に失敗しました:", error.message);
  }

  return (
    <div className="h-full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">AI分析レポート</h1>
        <p className="text-sm text-slate-500 mt-1">過去に生成された月次の分析レポートを閲覧できます。</p>
      </header>

      <div className="max-w-5xl">
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
            <p className="font-bold">エラー</p>
            <p>レポートの読み込みに失敗しました。</p>
          </div>
        )}

        {reports && reports.length > 0 ? (
          <div className="space-y-8">
            {reports.map((report) => (
              <div key={report.month} className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold text-slate-800 border-b pb-3 mb-4">
                  {formatMonth(report.month)} の分析レポート
                </h2>
                <ReportContent content={report.content} />
                <p className="text-right text-sm text-slate-400 mt-4 pt-4 border-t">
                  生成日時: {new Date(report.created_at).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          !error && (
            <div className="text-center py-16 bg-white rounded-lg shadow-md">
              <div className="mx-auto mb-4 h-16 w-16 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 01-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 013.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 013.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 01-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.923-2.923L12 17.25l1.178-.398a3.375 3.375 0 002.923-2.923L16.5 12.75l.398 1.178a3.375 3.375 0 002.923 2.923L21 17.25l-1.178.398a3.375 3.375 0 00-2.923 2.923z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-700">分析レポートはまだありません</h3>
              <p className="text-slate-500 mt-1">新しいレポートが生成されると、ここに表示されます。</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
