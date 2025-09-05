// components/main-sidebar.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

type Module =
  | "sales"
  | "web"
  | "wholesale"
  | "brand-store"
  | "food-store"
  | "finance"
  | "kpi";

export default function MainSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const [activeModule, setActiveModule] = useState<Module>("sales");

  useEffect(() => {
    if (pathname.startsWith("/web-sales")) setActiveModule("web");
    else if (pathname.startsWith("/wholesale")) setActiveModule("wholesale");
    else if (pathname.startsWith("/brand-store-analysis")) setActiveModule("brand-store");
    else if (pathname.startsWith("/food-store-analysis")) setActiveModule("food-store");
    else if (pathname.startsWith("/finance")) setActiveModule("finance");
    else if (pathname === "/kpi" || pathname.startsWith("/kpi/")) setActiveModule("kpi");
    else setActiveModule("sales");
  }, [pathname]);

  const goto = (m: Module) => {
    setActiveModule(m);
    if (m === "sales") router.push("/sales/dashboard");
    else if (m === "web") router.push("/web-sales/dashboard");
    else if (m === "wholesale") router.push("/wholesale/dashboard");
    else if (m === "brand-store") router.push("/brand-store-analysis");
    else if (m === "food-store") router.push("/food-store-analysis");
    else if (m === "finance") router.push("/finance/general-ledger");
    else if (m === "kpi") router.push("/kpi"); // ← KPIは一番下・パスワード保護
  };

  const baseBtn = "w-full justify-start text-white hover:bg-slate-700 transition";
  const variant = (m: Module) => (activeModule === m ? "secondary" : "ghost");

  return (
    <div className="w-64 bg-slate-800 text-white flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold">TSAシステム</h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Button variant={variant("sales")} className={baseBtn} onClick={() => goto("sales")}>
          売上報告システム
        </Button>

        <Button variant={variant("web")} className={baseBtn} onClick={() => goto("web")}>
          WEB販売管理システム
        </Button>
        <Button variant={variant("wholesale")} className={baseBtn} onClick={() => goto("wholesale")}>
          卸販売管理システム
        </Button>
        <Button variant={variant("brand-store")} className={baseBtn} onClick={() => goto("brand-store")}>
          ブランド館店舗分析
        </Button>
        <Button variant={variant("food-store")} className={baseBtn} onClick={() => goto("food-store")}>
          食のブランド館分析
        </Button>
        <Button variant={variant("finance")} className={baseBtn} onClick={() => goto("finance")}>
          財務分析システム
        </Button>

        {/* ─── ここを一番下に配置：幹部用KPI（パスワード保護） ─── */}
        <div className="pt-3 mt-3 border-t border-slate-700">
          <Button variant={variant("kpi")} className={baseBtn} onClick={() => goto("kpi")}>
            売上KPIダッシュボード（幹部）
          </Button>
        </div>
      </nav>

      {session && (
        <div className="p-4 border-t border-slate-700">
          <div className="text-sm text-slate-300 mb-2">{session.user?.name}</div>
          <Button variant="ghost" size="sm" className="w-full text-slate-300 hover:bg-slate-700" onClick={() => signOut()}>
            ログアウト
          </Button>
        </div>
      )}
    </div>
  );
}
