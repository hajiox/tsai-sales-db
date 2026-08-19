import Link from "next/link";
import { Building2, Warehouse } from "lucide-react";

type InventoryMode = "warehouse" | "partner";

export function InventoryModeNav({ current }: { current: InventoryMode }) {
  const items = [
    {
      key: "warehouse" as const,
      href: "/wholesale/inventory",
      label: "倉庫",
      icon: Warehouse,
    },
    {
      key: "partner" as const,
      href: "/wholesale/inventory/other-stores",
      label: "他社",
      icon: Building2,
    },
  ];

  return (
    <nav
      aria-label="決算棚卸しの種類"
      className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = current === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold transition-colors ${
              active
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
