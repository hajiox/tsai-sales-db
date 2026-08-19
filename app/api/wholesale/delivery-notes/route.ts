export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createWebDeliveryNote, listDeliveryNotes } from '@/lib/wholesale-delivery-notes';

export async function GET(req: NextRequest) {
  try {
    const limit = Number(new URL(req.url).searchParams.get('limit') || 30);
    const deliveryNotes = await listDeliveryNotes(limit);
    return NextResponse.json({ success: true, deliveryNotes });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '納品書一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deliveryNote = await createWebDeliveryNote(body);
    return NextResponse.json({ success: true, deliveryNote });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '納品書の発行に失敗しました' },
      { status: 400 }
    );
  }
}
