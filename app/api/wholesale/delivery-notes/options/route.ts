export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getDeliveryNoteOptions } from '@/lib/wholesale-delivery-notes';

export async function GET() {
  try {
    const data = await getDeliveryNoteOptions();
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '納品書発行データの取得に失敗しました' },
      { status: 500 }
    );
  }
}
