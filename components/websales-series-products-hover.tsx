"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Anchor as PopoverAnchor } from "@radix-ui/react-popover"
import { Popover, PopoverContent } from "@/components/ui/popover"
import type { WebSalesProductSummary } from "@/lib/web-sales-product-summary"

type Props = {
  seriesName: string;
  periodLabel: string;
  products: WebSalesProductSummary[];
  formatMoney: (amount: number | null) => string;
  onOpen: () => void;
  children: ReactNode;
};

export function WebSalesSeriesProductsHover({ seriesName, periodLabel, products, formatMoney, onOpen, children }: Props) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  };
  const show = () => {
    cancelClose();
    onOpen();
    setOpen(true);
  };
  const closeSoon = () => {
    cancelClose();
    // Allow the pointer to cross the gap into the scrollable product list.
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={`${seriesName}の商品別実績`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          className="h-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onMouseEnter={show}
          onMouseLeave={closeSoon}
          onFocus={show}
          onBlur={closeSoon}
          onClick={show}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              show();
            }
          }}
        >
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        id={contentId}
        aria-label={`${seriesName}の商品別実績`}
        align="start"
        sideOffset={6}
        className="w-[min(520px,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={cancelClose}
        onMouseLeave={closeSoon}
        onFocusCapture={cancelClose}
        onBlurCapture={closeSoon}
      >
        <div className="border-b px-3 py-2">
          <h4 className="text-sm font-semibold">{seriesName}の商品別実績</h4>
          <p className="text-xs text-gray-500">{periodLabel}</p>
        </div>
        <div className="max-h-[min(360px,calc(var(--radix-popover-content-available-height)-5rem))] overflow-y-auto">
          {products.length ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-600">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">商品名</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2 text-right">販売個数</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">実売額</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.productId} className="border-t">
                    <td className="break-words px-3 py-2">{product.productName}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{product.count.toLocaleString("ja-JP")}個</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatMoney(product.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="p-3 text-xs text-gray-500">この期間の商品別実績はありません。</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
