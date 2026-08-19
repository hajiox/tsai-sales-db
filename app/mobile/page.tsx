import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Camera,
  ChefHat,
  ChevronRight,
  ClipboardEdit,
  ClipboardList,
  FileText,
  ImagePlus,
  Landmark,
  Link2,
  LineChart,
  PackageSearch,
  ScanLine,
  Sparkles,
  ShoppingCart,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";
import { PwaInstallButton } from "@/components/pwa-install-button";

type MobileAction = {
  title: string;
  label: string;
  href: string;
  icon: LucideIcon;
  iconClassName: string;
  iconBackgroundClassName: string;
};

const mobileActions: MobileAction[] = [
  {
    title: "ラベルAI取込",
    label: "原材料ラベル",
    href: "/recipe/database/label-import/mobile",
    icon: ScanLine,
    iconClassName: "text-blue-700",
    iconBackgroundClassName: "bg-blue-100",
  },
  {
    title: "商品写真登録",
    label: "レシピ写真",
    href: "/recipe/photo/mobile",
    icon: ImagePlus,
    iconClassName: "text-emerald-700",
    iconBackgroundClassName: "bg-emerald-100",
  },
  {
    title: "納品書を撮影",
    label: "チャーシュー原価",
    href: "/recipe/char-siu-production/scan",
    icon: Camera,
    iconClassName: "text-rose-700",
    iconBackgroundClassName: "bg-rose-100",
  },
  {
    title: "ブランド館棚卸し",
    label: "店舗在庫",
    href: "/brand-store-analysis/inventory",
    icon: Store,
    iconClassName: "text-violet-700",
    iconBackgroundClassName: "bg-violet-100",
  },
  {
    title: "製造棚卸し",
    label: "食材・資材",
    href: "/recipe/inventory",
    icon: Boxes,
    iconClassName: "text-amber-700",
    iconBackgroundClassName: "bg-amber-100",
  },
  {
    title: "卸倉庫棚卸し",
    label: "助ネコ在庫",
    href: "/wholesale/inventory",
    icon: Warehouse,
    iconClassName: "text-cyan-700",
    iconBackgroundClassName: "bg-cyan-100",
  },
  {
    title: "伝票発行",
    label: "ヤマト・佐川",
    href: "/shipping-labels",
    icon: Truck,
    iconClassName: "text-indigo-700",
    iconBackgroundClassName: "bg-indigo-100",
  },
  {
    title: "卸売上入力",
    label: "日別実績",
    href: "/wholesale/sales-input",
    icon: ClipboardEdit,
    iconClassName: "text-teal-700",
    iconBackgroundClassName: "bg-teal-100",
  },
  {
    title: "納品書発行",
    label: "卸販売",
    href: "/wholesale/delivery-notes",
    icon: FileText,
    iconClassName: "text-orange-700",
    iconBackgroundClassName: "bg-orange-100",
  },
];

const systemLinks: Array<{
  title: string;
  href: string;
  icon: LucideIcon;
}> = [
  { title: "売上報告システム", href: "/sales/dashboard", icon: BarChart3 },
  { title: "WEB販売管理システム", href: "/web-sales/dashboard", icon: ShoppingCart },
  { title: "卸販売管理システム", href: "/wholesale/dashboard", icon: PackageSearch },
  { title: "ブランド館店舗分析", href: "/brand-store-analysis", icon: Store },
  { title: "食のブランド館分析", href: "/food-store-analysis", icon: LineChart },
  { title: "レシピシステム", href: "/recipe", icon: ChefHat },
  { title: "売上KPIダッシュボード", href: "/kpi", icon: ClipboardList },
  { title: "財務分析システム", href: "/finance/dashboard", icon: Landmark },
  { title: "自社リンク集", href: "/links", icon: Link2 },
  { title: "使用可能AI", href: "/ai-tools", icon: Sparkles },
];

export default function MobileTopPage() {
  return (
    <main className="min-h-dvh bg-slate-100 pb-[max(24px,env(safe-area-inset-bottom))] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              TSA
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold">TSA モバイル</h1>
              <p className="text-[11px] font-medium text-slate-500">業務メニュー</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PwaInstallButton />
            <Link
              href="/sales/dashboard"
              className="hidden h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 active:bg-slate-100 sm:inline-flex"
            >
              売上画面
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-5">
        <section aria-labelledby="mobile-work-title">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="text-[11px] font-bold text-emerald-700">スマホ作業</p>
              <h2 id="mobile-work-title" className="mt-0.5 text-lg font-bold">
                スマホで作業
              </h2>
            </div>
            <span className="text-xs font-medium text-slate-500">9機能</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {mobileActions.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-h-[116px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm transition active:scale-[0.98] active:bg-slate-50"
                >
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-lg ${item.iconBackgroundClassName}`}
                  >
                    <Icon className={`h-5 w-5 ${item.iconClassName}`} aria-hidden="true" />
                  </div>
                  <div className="mt-4 min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="min-w-0 text-sm font-bold leading-tight text-slate-900">
                        {item.title}
                      </h3>
                      <ChevronRight
                        className="ml-auto h-4 w-4 shrink-0 text-slate-300 transition group-active:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">{item.label}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="systems-title" className="mt-7">
          <div className="mb-3 px-1">
            <p className="text-[11px] font-bold text-slate-500">全システム</p>
            <h2 id="systems-title" className="mt-0.5 text-lg font-bold">
              TSAシステム
            </h2>
          </div>

          <nav className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="TSAシステム一覧">
            {systemLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 text-sm font-semibold text-slate-800 last:border-b-0 active:bg-slate-50"
                >
                  <Icon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{item.title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </section>

        <p className="mt-6 text-center text-[11px] text-slate-400">TSA System</p>
      </div>
    </main>
  );
}
