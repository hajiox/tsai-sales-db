export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set'); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set'); })()
);

function getProvidedSecret(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  return req.headers.get('x-tsa-sync-secret') || bearer || '';
}

function normalizeName(value: string | null | undefined) {
  return (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/株式会社|有限会社|\(株\)|（株）|\(有\)|（有）|合同会社|合資会社|合名会社/g, '')
    .replace(/御中|様/g, '')
    .replace(/[【】\[\]（）()「」『』〈〉<>]/g, '')
    .replace(/[・･\s_\-—–ー.,，、。/／:：]/g, '')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const expectedSecret = process.env.TSA_DELIVERY_SYNC_SECRET || process.env.PUSH_NOTIFY_SECRET || '';
    if (!expectedSecret || getProvidedSecret(req) !== expectedSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const counterpartyId = String(body.counterpartyId || '').trim();
    const counterpartyName = String(body.counterpartyName || '').trim();
    const transactionType = body.transactionType === 'consignment'
      ? 'consignment'
      : body.transactionType === 'purchase' ? 'purchase' : null;
    const rawRate = Number(body.defaultRate);
    const defaultRate = rawRate > 1 ? rawRate / 100 : rawRate;

    if (!counterpartyId || !transactionType || !Number.isFinite(defaultRate) || defaultRate <= 0) {
      return NextResponse.json({ success: false, error: '取引先ID・取引形態・掛率が必要です' }, { status: 400 });
    }

    const { data: directMatch, error: directError } = await supabase
      .from('wholesale_customers')
      .select('id, customer_name, doc_scanner_counterparty_id')
      .eq('doc_scanner_counterparty_id', counterpartyId)
      .maybeSingle();
    if (directError) throw directError;

    let customer = directMatch;
    if (!customer && counterpartyName) {
      const normalized = normalizeName(counterpartyName);
      const { data: candidates, error: candidatesError } = await supabase
        .from('wholesale_customers')
        .select('id, customer_name, normalized_name, doc_scanner_counterparty_id');
      if (candidatesError) throw candidatesError;
      customer = (candidates || []).find(candidate =>
        normalizeName(candidate.normalized_name || candidate.customer_name) === normalized
      ) || null;
    }

    if (!customer) {
      return NextResponse.json({ success: true, matched: false });
    }

    const { data: updated, error: updateError } = await supabase
      .from('wholesale_customers')
      .update({
        transaction_type: transactionType,
        default_rate: defaultRate,
        doc_scanner_counterparty_id: customer.doc_scanner_counterparty_id || counterpartyId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id)
      .select('id, customer_name, transaction_type, default_rate')
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, matched: true, customer: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
