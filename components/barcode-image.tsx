"use client";

import { useRef, useCallback } from "react";
import { toast } from "sonner";

import { encodeEAN13, isValidJAN, renderJANEPS } from "@/lib/jan-barcode";

interface BarcodeImageProps {
    code: string;
    scale?: number;
}

export default function BarcodeImage({ code, scale = 4 }: BarcodeImageProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const draw = useCallback((canvas: HTMLCanvasElement) => {
        if (!canvas || !isValidJAN(code)) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const barWidth  = 2 * scale;
        const barHeight = 70 * scale;   // 全バー同じ高さ（ガードバー突き出しなし）
        const quietZone = 8 * scale;
        const fontSize  = 18 * scale;
        const textPad   = 0;            // バーと数字の隙間なし（密着）

        const encoded = encodeEAN13(code);
        if (encoded.length === 0) return;

        const binaryStr = encoded.join("");

        // 左余白: 先頭1桁が収まる最小幅
        const leftQuiet = Math.max(quietZone, Math.ceil(fontSize * 0.7));

        const totalWidth  = leftQuiet + binaryStr.length * barWidth + quietZone;
        const totalHeight = barHeight + textPad + fontSize + 2 * scale;

        canvas.width  = totalWidth;
        canvas.height = totalHeight;

        // 白背景
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // バー描画（全バー同じ高さ）
        const barsOriginX = leftQuiet;
        let x = barsOriginX;
        for (let i = 0; i < binaryStr.length; i++) {
            if (binaryStr[i] === "1") {
                ctx.fillStyle = "#000000";
                ctx.fillRect(x, 0, barWidth, barHeight);
            }
            x += barWidth;
        }

        // テキスト描画（バー直下）
        ctx.fillStyle    = "#000000";
        ctx.textBaseline = "top";
        const textY = barHeight + textPad;
        ctx.font = `${fontSize}px 'Courier New', monospace`;

        // 先頭1桁: start guard の左外側
        ctx.textAlign = "right";
        ctx.fillText(code[0], barsOriginX - 2 * scale, textY);

        // 左グループ (digits 1-6)
        const leftGroupXStart = barsOriginX + 3 * barWidth;
        const leftGroupXEnd   = barsOriginX + (3 + 6 * 7) * barWidth;
        ctx.textAlign = "center";
        ctx.fillText(code.substring(1, 7), (leftGroupXStart + leftGroupXEnd) / 2, textY);

        // 右グループ (digits 7-12)
        const rightGroupXStart = barsOriginX + (3 + 6 * 7 + 5) * barWidth;
        const rightGroupXEnd   = barsOriginX + (3 + 6 * 7 + 5 + 6 * 7) * barWidth;
        ctx.fillText(code.substring(7), (rightGroupXStart + rightGroupXEnd) / 2, textY);

    }, [code, scale]);

    const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
        if (node) {
            (canvasRef as any).current = node;
            draw(node);
        }
    }, [draw]);

    const copyImage = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        try {
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(b => b ? resolve(b) : reject(new Error("Blob生成失敗")), "image/png");
            });
            await navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob })
            ]);
            toast.success("バーコード画像をコピーしました");
        } catch {
            toast.error("コピーに失敗しました（HTTPS環境が必要な場合があります）");
        }
    };

    const downloadEPS = () => {
        if (!isValidJAN(code)) return;

        const eps = renderJANEPS(code);

        const blob = new Blob([eps], { type: "application/postscript" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `barcode_${code}.eps`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("バーコードEPSをダウンロードしました");
    };

    if (!isValidJAN(code)) return null;

    return (
        <div className="flex flex-col items-center gap-1">
            <canvas
                ref={setCanvasRef}
                className="max-h-[60px]"
                style={{ imageRendering: "pixelated" }}
            />
            <div className="flex gap-1">
                <button
                    onClick={copyImage}
                    title="画像コピー"
                    className="px-1.5 py-0.5 text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 rounded border border-blue-200 transition"
                >
                    📋 コピー
                </button>
                <button
                    onClick={downloadEPS}
                    title="EPS保存（ベクター形式）"
                    className="px-1.5 py-0.5 text-[10px] bg-gray-50 hover:bg-gray-100 text-gray-600 rounded border border-gray-200 transition"
                >
                    💾 EPS保存
                </button>
            </div>
        </div>
    );
}
