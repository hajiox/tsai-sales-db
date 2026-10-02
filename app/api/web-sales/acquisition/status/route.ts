import { NextResponse } from "next/server";
import { isFinanceAdmin } from "@/lib/finance-acquisition/auth";
import { getAcquisitionStatus } from "@/lib/finance-acquisition/status";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  if(!await isFinanceAdmin())return NextResponse.json({error:"ログインが必要です"},{status:401});
  try {
    const month=new URL(request.url).searchParams.get("reportMonth")||new Date().toISOString().slice(0,7);
    return NextResponse.json(await getAcquisitionStatus(month),{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"取得経路を確認できません"},{status:400});}
}
