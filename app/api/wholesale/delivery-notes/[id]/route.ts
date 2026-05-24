export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { deleteDeliveryNote, getDeliveryNote } from '@/lib/wholesale-delivery-notes';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deliveryNote = await getDeliveryNote(decodeURIComponent(id));
    if (!deliveryNote) {
      return NextResponse.json({ success: false, error: '納品書が見つかりません' }, { status: 404 });
    }
    return NextResponse.json({ success: true, deliveryNote });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '納品書の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await deleteDeliveryNote(decodeURIComponent(id));
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '納品書の削除に失敗しました' },
      { status: 500 }
    );
  }
}
