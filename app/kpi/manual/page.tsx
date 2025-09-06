// /app/kpi/manual/page.tsx  ← ラッパ（Server）
import ManualClient from './ManualClient';

// このページは動的（静的プリレンダ無効）
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ManualClient />;
}
