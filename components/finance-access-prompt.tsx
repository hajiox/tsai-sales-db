'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';

export function FinanceAccessPrompt({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !password) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/finance/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) throw new Error(response.status === 401
        ? '財務分析用パスワードをご確認ください。' : '認証できませんでした。時間を置いて再試行してください。');
      setPassword('');
      await onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '認証に失敗しました。');
    } finally { setSubmitting(false); }
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><LockKeyhole className="h-5 w-5 text-indigo-600" />財務分析の認証が必要です</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">認証期限が切れた場合も、パスワードを入力すると、この画面で決算資料の表示を再開できます。</p>
      <form onSubmit={authenticate} className="mt-4 flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-slate-700">財務分析用パスワード
          <input type="password" name="finance-password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required disabled={submitting}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
        </label>
        <button type="submit" disabled={submitting || !password} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? '認証中…' : '認証して表示'}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
