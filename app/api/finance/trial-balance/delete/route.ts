// /app/api/finance/trial-balance/delete/route.ts ver.1
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// 管理者権限(Service Role)でSupabaseクライアントを作成
// これによりRow Level Security(RLS)をバイパスして確実に削除を実行できます
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: Request) {
  try {
    const { month } = await request.json();

    if (!month) {
      return NextResponse.json(
        { error: "削除対象の月が指定されていません" },
        { status: 400 }
      );
    }

    // YYYY-MM形式をYYYY-MM-01形式に変換
    const reportMonth = `${month}-01`;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. general_ledger (仕訳明細) から削除
    const { error: ledgerError } = await supabase
      .from("general_ledger")
      .delete()
      .eq("report_month", reportMonth);

    if (ledgerError) {
      console.error("Error deleting ledger:", ledgerError);
      throw new Error(`仕訳データの削除に失敗しました: ${ledgerError.message}`);
    }

    // 2. monthly_account_balance (月次残高) から削除
    const { error: balanceError } = await supabase
      .from("monthly_account_balance")
      .delete()
      .eq("report_month", reportMonth);

    if (balanceError) {
      console.error("Error deleting balance:", balanceError);
      throw new Error(`月次残高の削除に失敗しました: ${balanceError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `${month}のデータを削除しました`,
    });
  } catch (error: any) {
    console.error("Delete API Error:", error);
    return NextResponse.json(
      { error: error.message || "削除処理中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
