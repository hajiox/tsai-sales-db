"use client";

import { useEffect, useState } from "react";
import { ExternalLink, QrCode } from "lucide-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const INVENTORY_PATH = "/brand-store-analysis/inventory";

export function InventoryQrCode({ className = "" }: { className?: string }) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    const inventoryUrl = `${window.location.origin}${INVENTORY_PATH}`;
    QRCode.toDataURL(inventoryUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setImageUrl).catch(() => setImageUrl(""));
  }, []);

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-white p-1 ${className}`}
      title="棚卸し画面のQRコード"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="決算棚卸し画面のQRコード" className="h-full w-full" draggable={false} />
      ) : (
        <div className="h-full w-full animate-pulse rounded-sm bg-slate-100" />
      )}
    </div>
  );
}

export function InventoryQrDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    const inventoryUrl = `${window.location.origin}${INVENTORY_PATH}`;
    setUrl(inventoryUrl);
    QRCode.toDataURL(inventoryUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setImageUrl).catch(() => setImageUrl(""));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            スマホで棚卸し
          </DialogTitle>
          <DialogDescription>スマートフォンで読み取ると、決算棚卸し画面を直接開きます。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {imageUrl ? (
            <img src={imageUrl} alt="決算棚卸し画面のQRコード" className="h-[260px] w-[260px]" />
          ) : (
            <div className="grid h-[260px] w-[260px] place-items-center bg-slate-50 text-sm text-slate-500">QR作成中...</div>
          )}
          <div className="w-full break-all rounded-md bg-slate-50 px-3 py-2 text-center text-xs text-slate-600">{url}</div>
          <Button asChild className="w-full gap-2 bg-slate-900 hover:bg-slate-800">
            <a href={INVENTORY_PATH}>
              <ExternalLink className="h-4 w-4" />
              この端末で開く
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
