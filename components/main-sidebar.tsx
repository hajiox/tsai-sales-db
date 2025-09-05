// /components/main-sidebar.tsx
"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

type Module =
  | "sales"
  | "kpi"
  | "web"
  | "wholesale"
  | "brand-store"
  | "food-store"
  | "finance";

export default function MainSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const [activeModule, setActiveModule] = useState<Module>("sales");

  useEffect(() => {
    if (pathname.startsWith("/kpi")) {
      setActiveModule("kpi");
    } else if (pathname.startsWith("/web-sales")) {
      setActiveModule("web");
    } else if (pathname.startsWith("/wholesale")) {
      setActiveModule("wholesale");
    } else if (pathname.startsWith("/brand-store-analysis")) {
      setActiveModule("brand-store");
    } else if (pathname.startsWith("/food-store-analysis")) {
      setActiveModule("food-store");
    } else if (pathname.startsWith("/finance")) {
      setActiveModule("finance");
    } else {
      setActiveModule("sales");
    }
  }, [pathname]);

  const handleModuleChange = (module: Module) => {
    setActiveModule(module);
    if (module === "sales") {
      router.push("/sales/dashboard");
    } else if (module === "kpi") {
      router.push("/kpi"); // ← KPIダッシュボード
    } else if (module === "web") {
      router.push("/web-sales/dashboard");
    } else if (module === "wholesale") {
      router.push("/wholesale/dashboard");
    } else if (module === "brand-store") {
      router.push("/brand-store-analysis");
    } else if (module === "food-store") {
      router.push("/food-store-analysis");
    } else if (module === "finance") {
      router.push("/finance/general-ledger");
    }
  };

  const baseBtn =
    "w-full justify-start text-white hover:bg-slate-700 transition";
  const activeVariant = (m: Module) =>
    activeModule === m ? "secondary" : "ghost";

  return (
    <div className="w-64 bg-slate-800 text-white flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold">TSAシステム</h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Button
          variant={activeVariant("sales")}
          className={baseBtn}
          onClick={() => handleModuleChange("sales")}
        >
          売上報告システム
        </Button>

        {/* 追加：売上KPIダッシュボード */}
        <Button
          variant={activeVariant("kpi")}
          className={baseBtn}
          onClick={() => handleModuleChange("kpi")}
        >
          売上KPIダッシュボード
        </Button>

        <Button
          variant={activeVariant("web")}
          className={baseBtn}
          onClick={() => handleModuleChange("web")}
        >
          WEB販売管理システム
        </Button>
        <Button
          variant={activeVariant("wholesale")}
          className={baseBtn}
          onClick={() => handleModuleChange("wholesale")}
        >
          卸販売管理システム
        </Button>
        <Button
          variant={activeVariant("brand-store")}
          className={baseBtn}
          onClick={() => handleModuleChange("brand-store")}
        >
          ブランド館店舗分析
        </Button>
        <Button
          variant={activeVariant("food-store")}
          className={baseBtn}
          onClick={() => handleModuleChange("food-store")}
        >
          食のブランド館分析
        </Button>
        <Button
          variant={activeVariant("finance")}
          className={baseBtn}
          onClick={() => handleModuleChange("finance")}
        >
          財務分析システム
        </Button>
      </nav>

      {session && (
        <div className="p-4 border-t border-slate-700">
          <div className="text-sm text-slate-300 mb-2">
            {session.user?.name}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-slate-300 hover:bg-slate-700"
            onClick={() => signOut()}
          >
            ログアウト
          </Button>
        </div>
      )}
    </div>
  );
}
