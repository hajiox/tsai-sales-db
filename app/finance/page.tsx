// app/finance/page.tsx
import { redirect } from 'next/navigation';

export default function FinanceRoot() {
  // /finance に来たら常にダッシュボードへ送る
  redirect('/finance/dashboard');
}
