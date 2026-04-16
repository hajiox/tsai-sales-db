import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

if (publicVapidKey && privateVapidKey) {
  webPush.setVapidDetails(
    'mailto:staff@aizu-tv.com',
    publicVapidKey,
    privateVapidKey
  );
}

export async function POST(req: NextRequest) {
  try {
    // 簡易認証: DocScannerからの呼び出しのみ許可
    const authHeader = req.headers.get('x-push-secret');
    const expectedSecret = process.env.PUSH_NOTIFY_SECRET || '';
    if (expectedSecret && authHeader !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, body, url } = await req.json();

    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const { data: subscriptions, error } = await sb.from('push_subscriptions').select('*');

    if (error || !subscriptions?.length) {
      return NextResponse.json({ success: false, message: 'No subscriptions' });
    }

    const payload = JSON.stringify({
      title: title || 'DocScanner 通知',
      body: body || '新しい通知があります',
      url: url || '/fax'
    });

    let successCount = 0;
    let failCount = 0;

    const promises = subscriptions.map(sub => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      return webPush.sendNotification(pushSub, payload).then(() => {
        successCount++;
      }).catch(async (err) => {
        failCount++;
        console.error(`[WebPush] ID:${sub.id} 失敗 (${err.statusCode})`);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          console.log(`[WebPush] ID:${sub.id} 期限切れ削除`);
        }
      });
    });

    await Promise.all(promises);
    console.log(`[WebPush] 結果: 成功=${successCount} 失敗=${failCount}`);
    return NextResponse.json({ success: true, sentCount: successCount, failCount });
  } catch (err: any) {
    console.error('[Push Notify Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
