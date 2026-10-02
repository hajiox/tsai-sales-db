import { NextResponse } from "next/server";
import { isFinanceAdmin,isSameOriginFinanceRequest } from "@/lib/finance-acquisition/auth";
import { enqueueFinanceAcquisitions,TASK_KIND } from "@/lib/finance-acquisition/dispatch";
import { validatePeriod } from "@/lib/web-sales-automation/date";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  if (!await isFinanceAdmin()) return NextResponse.json({error:"ログインが必要です"},{status:401});
  if (!isSameOriginFinanceRequest(request)) return NextResponse.json({error:"送信元が正しくありません"},{status:403});
  try {
    const text=await request.text(); if(Buffer.byteLength(text)>8000) return NextResponse.json({error:"要求が大きすぎます"},{status:413});
    const body=JSON.parse(text); const taskKey=String(body.taskKey || "web_sales_import");
    if (!Object.hasOwn(TASK_KIND,taskKey)) return NextResponse.json({error:"取得種別が正しくありません"},{status:400});
    const kind=TASK_KIND[taskKey as keyof typeof TASK_KIND];
    const channels=Array.isArray(body.channels)?body.channels.map(String):[];
    if (!channels.length || channels.length>7) return NextResponse.json({error:"取得対象を選択してください"},{status:400});
    const period=validatePeriod(String(body.startDate||""),String(body.endDate||""));
    return NextResponse.json(await enqueueFinanceAcquisitions({kind,channels,period,allowBridge:true,incompleteOnly:body.incompleteOnly===true}));
  } catch {return NextResponse.json({error:"取得要求を登録できません。対象・期間・既存の処理状態を確認してください"},{status:400});}
}
