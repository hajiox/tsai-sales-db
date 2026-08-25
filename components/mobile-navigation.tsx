"use client"

import Link from "next/link"
import { useEffect, useId, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  Camera,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  FileScan,
  Home,
  HardDrive,
  LayoutGrid,
  Link2,
  LogOut,
  Menu,
  PackageCheck,
  QrCode,
  ReceiptText,
  ScanLine,
  ShoppingCart,
  Store,
  Truck,
  Warehouse,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react"

type NavigationItem = {
  label: string
  href: string
  icon: LucideIcon
  external?: boolean
  description?: string
}

type NavigationSection = {
  label: string
  items: NavigationItem[]
}

const titleRoutes = [
  ["/system/label-check/check", "裏ラベルチェック"],
  ["/system/label-check", "裏ラベル履歴"],
  ["/recipe/char-siu-production/scan", "納品書撮影"],
  ["/recipe/database/label-import/mobile", "ラベル撮影"],
  ["/recipe/photo/mobile", "レシピ写真登録"],
  ["/recipe/char-siu-production", "チャーシュー製造原価"],
  ["/recipe/database", "材料データベース"],
  ["/recipe/inventory", "製造棚卸し"],
  ["/recipe", "レシピシステム"],
  ["/shipping-labels", "伝票発行システム"],
  ["/web-sales/advertising", "経費管理"],
  ["/web-sales", "WEB販売管理"],
  ["/wholesale/inventory/other-stores", "決算棚卸し（他社）"],
  ["/wholesale/inventory", "決算棚卸し（倉庫）"],
  ["/wholesale/delivery-notes", "納品書発行"],
  ["/wholesale/sales-input", "卸売上入力"],
  ["/wholesale", "卸販売管理"],
  ["/brand-store-analysis/inventory", "ブランド館決算棚卸し"],
  ["/brand-store-analysis", "ブランド館店舗分析"],
  ["/food-store-analysis", "食のブランド館分析"],
  ["/finance/char-siu-production", "チャーシュー原価分析"],
  ["/finance", "財務分析"],
  ["/sales", "売上報告"],
  ["/kpi", "売上KPI"],
  ["/ai-tools", "使用可能AI"],
  ["/links", "自社リンク集"],
  ["/system/backup", "バックアップ管理"],
  ["/mobile", "モバイルホーム"],
] as const

const navigationSections: NavigationSection[] = [
  {
    label: "スマホで使う",
    items: [
      {
        label: "裏ラベル簡易チェック",
        href: "/system/label-check/check?mode=simple",
        icon: Zap,
        description: "賞味期限を撮影して判定",
      },
      {
        label: "チャーシュー納品書撮影",
        href: "/recipe/char-siu-production/scan",
        icon: ScanLine,
        description: "豚バラ肉・ネギ・生姜の納品書を送信",
      },
      {
        label: "材料ラベルAI取込",
        href: "/recipe/database/label-import/mobile",
        icon: FileScan,
        description: "食品表示ラベルを撮影して取り込み",
      },
      {
        label: "レシピ写真登録",
        href: "/recipe/photo/mobile",
        icon: Camera,
        description: "商品・工程写真をスマホから登録",
      },
      {
        label: "ブランド館決算棚卸し",
        href: "/brand-store-analysis/inventory",
        icon: QrCode,
        description: "店舗在庫をその場で入力",
      },
      {
        label: "製造決算棚卸し",
        href: "/recipe/inventory",
        icon: Boxes,
        description: "食材・資材の在庫を入力",
      },
      {
        label: "卸売上入力",
        href: "/wholesale/sales-input",
        icon: ShoppingCart,
        description: "卸・OEMの売上を入力",
      },
    ],
  },
  {
    label: "販売・分析",
    items: [
      { label: "売上報告システム", href: "/sales/dashboard", icon: BarChart3 },
      { label: "WEB販売管理", href: "/web-sales/dashboard", icon: ShoppingCart },
      { label: "卸販売管理", href: "/wholesale/dashboard", icon: Warehouse },
      { label: "ブランド館店舗分析", href: "/brand-store-analysis", icon: Store },
      { label: "食のブランド館分析", href: "/food-store-analysis", icon: Building2 },
      { label: "売上KPIダッシュボード", href: "/kpi", icon: BarChart3 },
    ],
  },
  {
    label: "製造・業務",
    items: [
      { label: "レシピシステム", href: "/recipe", icon: BookOpen },
      { label: "材料データベース", href: "/recipe/database", icon: Boxes },
      { label: "チャーシュー製造原価入力", href: "/recipe/char-siu-production", icon: ReceiptText },
      { label: "伝票発行システム", href: "/shipping-labels", icon: Truck },
      { label: "納品書発行", href: "/wholesale/delivery-notes", icon: PackageCheck },
      { label: "財務分析システム", href: "/finance/dashboard", icon: CircleDollarSign },
    ],
  },
  {
    label: "その他",
    items: [
      { label: "自社リンク集", href: "/links", icon: Link2 },
      { label: "使用可能AI", href: "/ai-tools", icon: Bot },
      { label: "バックアップ管理", href: "/system/backup", icon: HardDrive },
      { label: "裏ラベルチェック", href: "/system/label-check", icon: Zap },
      {
        label: "TS Groupware",
        href: "https://v0-line-blush.vercel.app",
        icon: LayoutGrid,
        external: true,
      },
      {
        label: "Doc Scanner",
        href: "http://192.168.110.200:3004",
        icon: FileScan,
        external: true,
      },
      {
        label: "内職管理システム",
        href: "https://naisyoku.aizubrandhall.com/dashboard",
        icon: Boxes,
        external: true,
      },
      {
        label: "ヤマト出荷データ管理",
        href: "http://192.168.110.200:3003",
        icon: Truck,
        external: true,
      },
    ],
  },
]

const bottomNavigation: NavigationItem[] = [
  { label: "ホーム", href: "/mobile", icon: Home },
  { label: "売上", href: "/sales/dashboard", icon: BarChart3 },
  { label: "レシピ", href: "/recipe", icon: BookOpen },
  { label: "伝票", href: "/shipping-labels", icon: Truck },
]

function isActiveRoute(pathname: string, href: string) {
  if (href === "/mobile") return pathname === "/mobile" || pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function getPageTitle(pathname: string) {
  return titleRoutes.find(([route]) => pathname === route || pathname.startsWith(`${route}/`))?.[1] ?? "TSA System"
}

export default function MobileNavigation() {
  const pathname = usePathname() || "/"
  const router = useRouter()
  const menuId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const { data: session } = useSession()

  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }

    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [isOpen])

  const title = getPageTitle(pathname)

  return (
    <div className="lg:hidden print:hidden">
      <header className="fixed inset-x-0 top-0 z-[90] border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur">
        <div className="grid h-14 grid-cols-[44px_minmax(0,1fr)_44px] items-center px-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 items-center justify-center text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            aria-label="前の画面に戻る"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <Link
            href="/mobile"
            className="min-w-0 px-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            aria-label="モバイルホームへ移動"
          >
            <span className="block truncate text-[11px] font-semibold leading-none text-emerald-700">TSA</span>
            <span className="mt-1 block truncate text-sm font-bold leading-none text-slate-950">{title}</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex h-11 w-11 items-center justify-center text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            aria-label="全メニューを開く"
            aria-expanded={isOpen}
            aria-controls={menuId}
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav
        aria-label="モバイル主要メニュー"
        className="fixed inset-x-0 bottom-0 z-[90] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)]"
      >
        <div className="grid h-16 grid-cols-5">
          {bottomNavigation.map((item) => {
            const Icon = item.icon
            const active = isActiveRoute(pathname, item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${
                  active ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${
              isOpen ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500"
            }`}
            aria-label="その他のメニューを開く"
            aria-expanded={isOpen}
            aria-controls={menuId}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
            <span>その他</span>
          </button>
        </div>
      </nav>

      {isOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="TSA全メニュー">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setIsOpen(false)}
            aria-label="メニューを閉じる"
          />

          <section
            id={menuId}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-slate-50 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
              <div>
                <p className="text-xs font-semibold text-emerald-700">TSA System</p>
                <h2 className="text-lg font-bold text-slate-950">全メニュー</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-11 w-11 items-center justify-center text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                aria-label="メニューを閉じる"
                autoFocus
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
              {navigationSections.map((section) => (
                <section key={section.label} className="mb-7 last:mb-0" aria-labelledby={`${menuId}-${section.label}`}>
                  <h3
                    id={`${menuId}-${section.label}`}
                    className="mb-2 border-b border-slate-200 pb-2 text-xs font-bold text-slate-500"
                  >
                    {section.label}
                  </h3>
                  <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const active = !item.external && isActiveRoute(pathname, item.href)

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          target={item.external ? "_blank" : undefined}
                          rel={item.external ? "noopener noreferrer" : undefined}
                          onClick={() => setIsOpen(false)}
                          className={`flex min-h-14 items-center gap-3 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${
                            active ? "bg-emerald-50 text-emerald-800" : "text-slate-800"
                          }`}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{item.label}</span>
                            {item.description && (
                              <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
                            )}
                          </span>
                          {item.external ? (
                            <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </section>
              ))}

              {session && (
                <section className="mt-7 border-t border-slate-200 pt-4">
                  <p className="truncate text-xs text-slate-500">
                    {session.user?.name || session.user?.email}
                  </p>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 border border-slate-300 bg-white text-sm font-semibold text-slate-700"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    ログアウト
                  </button>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
