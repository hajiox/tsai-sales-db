"use client";
import { useState } from "react";

export default function KpiPasswordPage({
  searchParams,
}: { searchParams?: { next?: string } }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/kpi/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      const next = searchParams?.next || "/kpi";
      location.href = next;
    } else {
      setErr("パスワードが違います");
    }
  }

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-lg font-bold mb-4">KPI（幹部資料）パスワード</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full border rounded px-3 py-2 text-black"
          placeholder="パスワード"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white rounded px-3 py-2"
        >
          送信
        </button>
        {err && <p className="text-red-500 text-sm">{err}</p>}
      </form>
    </div>
  );
}
