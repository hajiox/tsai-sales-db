// app/finance/page.tsx
import { redirect } from 'next/navigation';

export default function FinanceRoot() {
  // /finance に来たら常に Overview へ送る
  redirect('/finance/overview');
}
