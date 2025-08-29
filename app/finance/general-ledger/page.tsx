// app/finance/general-ledger/page.tsx
import dynamic from 'next/dynamic';

const ClientGL = dynamic(() => import('./ClientGL'), { ssr: false });

export default function GeneralLedgerPage() {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
      <ClientGL />
    </div>
  );
}
