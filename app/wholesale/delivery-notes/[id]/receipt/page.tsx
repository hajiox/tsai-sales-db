"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';

const PASSPRNT_APP_STORE_URL = 'https://apps.apple.com/jp/app/star-passprnt/id979827520';
const MOBILE_DELIVERY_NOTES_PATH = '/wholesale/delivery-notes';
const ISSUER = {
  name: '株式会社テクニカルスタッフ',
  postalCode: '〒965-0044',
  address: '福島県会津若松市七日町6-15',
  tel: 'TEL：0242-23-4001',
  fax: 'FAX：050-3094-7721',
};

type ReceiptItem = {
  productName: string;
  quantity: number;
  unit: string;
};

type DeliveryNote = {
  id: string;
  number: string | null;
  deliveryDate: string;
  customerName: string;
  items: ReceiptItem[];
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPassPrntHtml(note: DeliveryNote) {
  const items = note.items.map((item, index) => `
    <div class="item">
      <div class="product"><span class="number">${index + 1}.</span>${escapeHtml(item.productName)}</div>
      <div class="quantity">${escapeHtml(item.quantity)}${escapeHtml(item.unit)}</div>
    </div>
  `).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: 384px auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      width: 384px;
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
      font-size: 26px;
      line-height: 1.35;
    }
    body { padding: 14px 14px 28px; }
    .center { text-align: center; }
    .title { border-bottom: 2px solid #000; padding-bottom: 12px; font-size: 34px; font-weight: 700; letter-spacing: 0.14em; }
    .number { margin-top: 6px; font-size: 19px; }
    .meta { border-bottom: 2px dashed #000; padding: 14px 0; }
    .label { font-size: 21px; }
    .line { display: flex; justify-content: space-between; gap: 12px; }
    .customer { margin-top: 6px; font-size: 28px; font-weight: 700; word-break: break-word; }
    .head { border-bottom: 2px solid #000; padding-bottom: 7px; font-size: 24px; font-weight: 700; }
    .item { border-bottom: 2px dashed #999; padding: 13px 0; }
    .product { font-size: 28px; font-weight: 700; word-break: break-word; }
    .number { display: inline-block; min-width: 34px; }
    .quantity { margin-top: 6px; font-size: 28px; font-weight: 700; }
    .footer { border-top: 2px solid #000; margin-top: 22px; padding-top: 12px; text-align: center; font-size: 22px; }
    .issuer { font-size: 28px; font-weight: 700; }
    .issuer-detail { margin-top: 5px; font-size: 23px; line-height: 1.35; }
  </style>
</head>
<body>
  <div class="title center">納品書</div>
  <div class="center number">${escapeHtml(note.number || '')}</div>
  <div class="meta">
    <div class="line"><span>納品日</span><span>${escapeHtml(note.deliveryDate)}</span></div>
    <div class="label" style="margin-top:8px;">納品先</div>
    <div class="customer">${escapeHtml(note.customerName)} 御中</div>
  </div>
  <div style="padding-top:14px;">
    <div class="head">品名 / 数量</div>
    ${items}
  </div>
  <div class="footer">
    <div class="issuer">${escapeHtml(ISSUER.name)}</div>
    <div class="issuer-detail">${escapeHtml(ISSUER.postalCode)}</div>
    <div class="issuer-detail">${escapeHtml(ISSUER.address)}</div>
    <div class="issuer-detail">${escapeHtml(ISSUER.tel)}</div>
    <div class="issuer-detail">${escapeHtml(ISSUER.fax)}</div>
  </div>
</body>
</html>`;
}

function buildPassPrntUri(note: DeliveryNote, backUrl: string) {
  const html = buildPassPrntHtml(note);
  return [
    'starpassprnt://v1/print/nopreview?',
    `back=${encodeURIComponent(backUrl)}`,
    `&size=384`,
    `&html=${encodeURIComponent(html)}`,
  ].join('');
}

export default function DeliveryNoteReceiptPage() {
  const params = useParams<{ id: string }>();
  const [note, setNote] = useState<DeliveryNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returnUrl, setReturnUrl] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/wholesale/delivery-notes/${encodeURIComponent(params.id)}`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || '納品書の取得に失敗しました');
        setNote(data.deliveryNote);
      } catch (e: any) {
        setError(e?.message || '納品書の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    if (params.id) load();
  }, [params.id]);

  useEffect(() => {
    setReturnUrl(new URL(MOBILE_DELIVERY_NOTES_PATH, window.location.origin).href);
  }, []);

  const passPrntUri = note && returnUrl ? buildPassPrntUri(note, returnUrl) : '#';
  const goBackToMobileIssue = () => {
    window.location.replace(MOBILE_DELIVERY_NOTES_PATH);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 print:bg-white print:text-black">
      <div className="no-print sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <button
            type="button"
            onClick={goBackToMobileIssue}
            className="flex min-h-10 items-center gap-2 rounded-full border border-slate-700 px-3 text-sm text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            発行画面
          </button>
          <a
            href={passPrntUri}
            aria-disabled={!note || !returnUrl}
            className={`flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white ${note && returnUrl ? 'bg-emerald-600 active:scale-95' : 'pointer-events-none bg-emerald-900 opacity-40'}`}
          >
            <Printer className="h-4 w-4" />
            Star印刷
          </a>
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 py-4 print:m-0 print:max-w-none print:p-0">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">読み込み中...</div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-900 bg-rose-950/30 p-8 text-center text-sm text-rose-200">{error}</div>
        ) : note ? (
          <article className="receipt-paper mx-auto bg-white px-[2.5mm] py-[3mm] text-black shadow-2xl print:shadow-none">
            <div className="no-print mb-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs leading-relaxed text-cyan-100">
              Star SM-S210i / 58mm / 384dots 向けの簡易納品書です。iPhone・Androidのブラウザ印刷または共有印刷からプリンターを選択してください。
            </div>
            <div className="no-print mb-3 space-y-2 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              <div className="font-bold">iPhoneの標準印刷にはAirPrint対応機だけが表示されます。SM-S210iは「Star PassPRNTで印刷」を使ってください。</div>
              <div className="grid grid-cols-1 gap-2">
                <a
                  href={passPrntUri}
                  aria-disabled={!returnUrl}
                  className={`flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-bold text-white ${returnUrl ? 'bg-emerald-600 active:scale-[0.98]' : 'pointer-events-none bg-emerald-900 opacity-40'}`}
                >
                  Star PassPRNTで印刷
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-10 rounded-xl border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900"
                >
                  AirPrint対応プリンターで印刷
                </button>
              </div>
              <div>事前にApp StoreでStar PassPRNTを入れ、BluetoothでSM-S210iをペアリングしてPassPRNT側でプリンターを選択してください。StarPRNT SDKサンプルアプリとは別アプリです。</div>
              <a href={PASSPRNT_APP_STORE_URL} target="_blank" rel="noreferrer" className="block rounded-lg border border-amber-300 bg-white px-3 py-2 text-center text-xs font-semibold text-amber-900">
                Star PassPRNTをApp Storeで開く
              </a>
            </div>
            <header className="border-b border-black pb-2 text-center">
              <div className="text-base font-bold tracking-[0.25em]">納品書</div>
              <div className="mt-1 text-[10px]">{note.number}</div>
            </header>

            <section className="space-y-1 border-b border-dashed border-black py-3 text-[11px]">
              <div className="flex justify-between gap-2">
                <span>納品日</span>
                <span>{note.deliveryDate}</span>
              </div>
              <div>
                <div className="text-[10px]">納品先</div>
                <div className="mt-1 text-sm font-bold">{note.customerName} 御中</div>
              </div>
            </section>

            <section className="py-2">
              <div className="border-b border-black pb-1 text-[10px] font-bold">
                品名 / 数量
              </div>
              <div className="divide-y divide-dashed divide-gray-400">
                {note.items.map((item, index) => (
                  <div key={`${item.productName}-${index}`} className="py-2">
                    <div className="flex gap-1 break-words text-[11px] font-semibold leading-snug">
                      <span className="shrink-0">{index + 1}.</span>
                      <span className="min-w-0">{item.productName}</span>
                    </div>
                    <div className="mt-1 text-[11px] font-semibold">{item.quantity}{item.unit}</div>
                  </div>
                ))}
              </div>
            </section>

            <footer className="mt-4 border-t border-black pt-2 text-center text-[11px] leading-relaxed">
              <div className="text-[12px] font-bold">{ISSUER.name}</div>
              <div>{ISSUER.postalCode}</div>
              <div>{ISSUER.address}</div>
              <div>{ISSUER.tel}</div>
              <div>{ISSUER.fax}</div>
            </footer>
          </article>
        ) : null}
      </main>

      <style jsx global>{`
        .receipt-paper {
          width: 58mm;
          min-height: 0;
        }
        @page {
          size: 58mm auto;
          margin: 0;
        }
        @media print {
          html,
          body {
            width: 58mm;
            background: #fff !important;
          }
          .no-print {
            display: none !important;
          }
          .receipt-paper {
            width: 58mm;
            min-height: 0;
            padding: 2mm 2.5mm 5mm;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
