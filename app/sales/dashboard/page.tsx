export const dynamic = 'force-dynamic';
export const revalidate = false;
export const fetchCache = 'force-no-store';
import dynamic from 'next/dynamic';

const DashboardClient = dynamic(() => import('@/components/sales/DashboardClient'), { ssr: false });

export default function Page() {
  return <DashboardClient />;
}

