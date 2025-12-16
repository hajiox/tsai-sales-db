// components/main-sidebar.tsx ver.3
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
  | "kpi"
  | "links"
  | "ai-tools";

export default function MainSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const [activeModule, setActiveModule] = useState<Module>("sales");

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/web-sales")) setActiveModule("web");
    else if (pathname.startsWith("/wholesale")) setActiveModule("wholesale");
    else if (pathname.startsWith("/brand-store-analysis")) setActiveModule("brand-store");
    else if (pathname.startsWith("/food-store-analysis")) setActiveModule("food-store");
    else if (pathname.startsWith("/finance")) setActiveModule("finance");
    else if (pathname.startsWith("/kpi")) setActiveModule("kpi");
    else if (pathname.startsWith("/links")) setActiveModule("links");
    else if (pathname.startsWith("/ai-tools")) setActiveModule("ai-tools");
    else setActiveModule("sales");
  }, [pathname]);

  const goto = (module: Module) => {
    setActiveModule(module);
    const map = {
      sales: "/sales/dashboard",
      web: "/web-sales/dashboard",
      wholesale: "/wholesale/dashboard",
      "brand-store": "/brand-store-analysis",
      "food-store": "/food-store-analysis",
      finance: "/finance/general-ledger",
      kpi: "/kpi",
      links: "/links",
      "ai-tools": "/ai-tools",
    } as const;
    router.push(map[module]);
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
          onClick={() => goto("sales")}
        >
          売上報告システム
        </Button>

        <Button
          variant={activeVariant("web")}
          className={baseBtn}
          onClick={() => goto("web")}
        >
          WEB販売管理システム
        </Button>

        <Button
          variant={activeVariant("wholesale")}
          className={baseBtn}
          onClick={() => goto("wholesale")}
        >
          卸販売管理システム
        </Button>

        <Button
          variant={activeVariant("brand-store")}
          className={baseBtn}
          onClick={() => goto("brand-store")}
        >
          ブランド館店舗分析
        </Button>

        <Button
          variant={activeVariant("food-store")}
          className={baseBtn}
          onClick={() => goto("food-store")}
        >
          食のブランド館分析
        </Button>

        <Button
          variant={activeVariant("finance")}
          className={baseBtn}
          onClick={() => goto("finance")}
        >
          財務分析システム
        </Button>

        <Button
          variant={activeVariant("kpi")}
          className={baseBtn}
          onClick={() => goto("kpi")}
        >
          売上KPIダッシュボード
        </Button>

        <div className="border-t border-slate-700 my-2 pt-2">
          <Button
            variant={activeVariant("links")}
            className={baseBtn}
            onClick={() => goto("links")}
          >
            自社リンク集
          </Button>

          <Button
            variant={activeVariant("ai-tools")}
            className={baseBtn}
            onClick={() => goto("ai-tools")}
          >
            使用可能AI
          </Button>
        </div>
      </nav>

      {session && (
        <div className="p-4 border-t border-slate-700">
          <div className="text-sm text-slate-300 mb-2">
            {session.user?.name ?? session.user?.email}
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
