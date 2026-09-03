"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Inbox, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/ads/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/ads/import", label: "Import", icon: Inbox },
  { href: "/ads/suggestions", label: "Suggestions", icon: Sparkles },
];

export default function AdsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-screen bg-muted/20">
      <aside className="hidden w-64 border-r bg-background/80 p-6 shadow-sm lg:block">
        <div className="space-y-8">
          <div>
            <h1 className="text-lg font-semibold">広告管理</h1>
            <p className="text-sm text-muted-foreground">
              Amazonキャンペーンの集計と改善
            </p>
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
