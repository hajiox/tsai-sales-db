export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { updateCustomerFavorite } from '@/lib/wholesale-delivery-notes';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const customer = await updateCustomerFavorite(decodeURIComponent(id), Boolean(body?.isFavorite));
    return NextResponse.json({ success: true, customer });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'お気に入りの更新に失敗しました' },
      { status: 400 }
    );
  }
}
