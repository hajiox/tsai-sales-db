"use client";

import { useRef, useCallback } from "react";
import { toast } from "sonner";

// EAN-13 encoding tables
const L_PATTERNS = [
    "0001101", "0011001", "0010011", "0111101", "0100011",
    "0110001", "0101111", "0111011", "0110111", "0001011"
];
const G_PATTERNS = [
    "0100111", "0110011", "0011011", "0100001", "0011101",
    "0111001", "0000101", "0010001", "0001001", "0010111"
];
const R_PATTERNS = [
    "1110010", "1100110", "1101100", "1000010", "1011100",
    "1001110", "1010000", "1000100", "1001000", "1110100"
];
const PARITY_PATTERNS = [
    "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
    "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"
];

function encodeEAN13(code: string): string[] {
    if (code.length !== 13) return [];
    const digits = code.split("").map(Number);
    const parity = PARITY_PATTERNS[digits[0]];
    const bars: string[] = [];
    bars.push("101");
    for (let i = 0; i < 6; i++) {
        const d = digits[i + 1];
        bars.push(parity[i] === "L" ? L_PATTERNS[d] : G_PATTERNS[d]);
    }
    bars.push("01010");
    for (let i = 0; i < 6; i++) {
        bars.push(R_PATTERNS[digits[i + 7]]);
    }
    bars.push("101");
    return bars;
}

interface BarcodeImageProps {
    code: string;
    scale?: number;
}

export default function BarcodeImage({ code, scale = 4 }: BarcodeImageProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const draw = useCallback((canvas: HTMLCanvasElement) => {
        if (!canvas || code.length !== 13) return;
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
        if (code.length !== 13) return;

        const barWidth   = 2;
        const barHeight  = 70;
        const quietZone  = 8;
        const fontSize   = 14;
        const textHeight = fontSize + 4;

        const encoded = encodeEAN13(code);
        if (encoded.length === 0) return;

        const binaryStr  = encoded.join("");
        const leftQuiet  = Math.max(quietZone, Math.ceil(fontSize * 0.7));
        const totalWidth = leftQuiet + binaryStr.length * barWidth + quietZone;
        const totalHeight = barHeight + textHeight;

        let eps = `%!PS-Adobe-3.0 EPSF-3.0\n`;
        eps += `%%BoundingBox: 0 0 ${totalWidth} ${totalHeight}\n`;
        eps += `%%Title: Barcode ${code}\n`;
        eps += `%%Creator: TSA Barcode Generator\n`;
        eps += `%%EndComments\n\n`;
        eps += `/rf { /h exch def /w exch def /y exch def /x exch def newpath x y moveto w 0 rlineto 0 h rlineto w neg 0 rlineto closepath fill } def\n\n`;

        let x = leftQuiet;
        for (let i = 0; i < binaryStr.length; i++) {
            if (binaryStr[i] === "1") {
                eps += `${x} ${textHeight} ${barWidth} ${barHeight} rf\n`;
            }
            x += barWidth;
        }

        eps += `\n/Courier findfont ${fontSize} scalefont setfont\n`;

        const d0x = leftQuiet - 2;
        eps += `${d0x} 0 moveto (${code[0]}) show\n`;

        const leftStart      = leftQuiet + 3 * barWidth;
        const leftGroupWidth = 6 * 7 * barWidth;
        const leftCenter     = leftStart + leftGroupWidth / 2;
        const leftText       = code.substring(1, 7);
        eps += `(${leftText}) stringwidth pop 2 div neg ${leftCenter} add 0 moveto (${leftText}) show\n`;

        const rightStart      = leftStart + leftGroupWidth + 5 * barWidth;
        const rightGroupWidth = 6 * 7 * barWidth;
        const rightCenter     = rightStart + rightGroupWidth / 2;
        const rightText       = code.substring(7);
        eps += `(${rightText}) stringwidth pop 2 div neg ${rightCenter} add 0 moveto (${rightText}) show\n`;

        eps += `\n%%EOF\n`;

        const blob = new Blob([eps], { type: "application/postscript" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `barcode_${code}.eps`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("バーコードEPSをダウンロードしました");
    };

    if (code.length !== 13) return null;

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
