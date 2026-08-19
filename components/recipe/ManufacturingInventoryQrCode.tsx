"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const INVENTORY_PATH = "/recipe/inventory";

export function ManufacturingInventoryQrCode({ className = "" }: { className?: string }) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}${INVENTORY_PATH}`;
    QRCode.toDataURL(url, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setImageUrl).catch(() => setImageUrl(""));
  }, []);

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-white p-1 ${className}`}
      title="製造棚卸し画面のQRコード"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="製造棚卸し画面のQRコード" className="h-full w-full" draggable={false} />
      ) : (
        <div className="h-full w-full animate-pulse rounded-sm bg-slate-100" />
      )}
    </div>
  );
}
