'use client';
import { useState, useEffect } from 'react';

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function FaxPushNotification() {
  const [status, setStatus] = useState<'loading' | 'unsupported' | 'subscribed' | 'unsubscribed'>('loading');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        if (sub) {
          setStatus('subscribed');
          // 自動同期
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
          }).catch(() => {});
        } else {
          setStatus('unsubscribed');
        }
      });
    });
  }, []);

  const subscribe = async () => {
    try {
      if (!publicVapidKey) { alert('VAPID鍵未設定'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alert('通知がブロックされています'); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });

      setStatus('subscribed');
      alert('✅ FAX受信通知を有効にしました！');
    } catch (e: any) {
      alert('エラー: ' + e.message);
    }
  };

  if (status === 'loading' || status === 'unsupported') return null;

  return (
    <button
      onClick={subscribe}
      disabled={status === 'subscribed'}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
        status === 'subscribed'
          ? 'bg-blue-900/30 text-blue-400 border border-blue-800/40 cursor-default'
          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md animate-pulse'
      }`}
    >
      {status === 'subscribed' ? '🔔 FAX通知ON' : '🔕 FAX通知を受け取る'}
    </button>
  );
}
