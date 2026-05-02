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
    // Start guard
    bars.push("101");
    // Left 6 digits
    for (let i = 0; i < 6; i++) {
        const d = digits[i + 1];
        bars.push(parity[i] === "L" ? L_PATTERNS[d] : G_PATTERNS[d]);
    }
    // Center guard
    bars.push("01010");
    // Right 6 digits
    for (let i = 0; i < 6; i++) {
        bars.push(R_PATTERNS[digits[i + 7]]);
    }
    // End guard
    bars.push("101");
    return bars;
}

interface BarcodeImageProps {
    code: string;
    scale?: number; // multiplier for print quality (default 4 = ~600dpi print quality)
}

export default function BarcodeImage({ code, scale = 4 }: BarcodeImageProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const draw = useCallback((canvas: HTMLCanvasElement) => {
        if (!canvas || code.length !== 13) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const barWidth = 2 * scale;
        const barHeight = 70 * scale;
        const quietZone = 10 * scale;
        const textHeight = 14 * scale;
        const fontSize = 12 * scale;

        const encoded = encodeEAN13(code);
        if (encoded.length === 0) return;

        // Calculate total width
        const binaryStr = encoded.join("");
        const totalBars = binaryStr.length;
        const width = totalBars * barWidth + quietZone * 2;
        const height = barHeight + textHeight + 4 * scale;

        canvas.width = width;
        canvas.height = height;

        // Transparent background
        ctx.clearRect(0, 0, width, height);

        // Draw bars
        let x = quietZone;
        for (let i = 0; i < binaryStr.length; i++) {
            if (binaryStr[i] === "1") {
                ctx.fillStyle = "#000000";
                ctx.fillRect(x, 0, barWidth, barHeight);
            }
            x += barWidth;
        }

        // Draw text below bars
        ctx.fillStyle = "#000000";
        ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        // First digit (left of start guard)
        ctx.fillText(code[0], quietZone - fontSize * 0.5, barHeight + 2 * scale);

        // Left group (digits 1-6)
        const leftStart = quietZone + 3 * barWidth; // after start guard
        const leftGroupWidth = 6 * 7 * barWidth;
        ctx.fillText(code.substring(1, 7), leftStart + leftGroupWidth / 2, barHeight + 2 * scale);

        // Right group (digits 7-12 + check digit)
        const rightStart = leftStart + leftGroupWidth + 5 * barWidth; // after center guard
        const rightGroupWidth = 6 * 7 * barWidth;
        ctx.fillText(code.substring(7), rightStart + rightGroupWidth / 2, barHeight + 2 * scale);
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

        const barWidth = 2;  // points (1pt = 1/72 inch)
        const barHeight = 70;
        const quietZone = 10;
        const fontSize = 10;

        const encoded = encodeEAN13(code);
        if (encoded.length === 0) return;

        const binaryStr = encoded.join("");
        const totalWidth = binaryStr.length * barWidth + quietZone * 2;
        const textHeight = fontSize + 6;
        const totalHeight = barHeight + textHeight;

        // EPS header
        let eps = `%!PS-Adobe-3.0 EPSF-3.0\n`;
        eps += `%%BoundingBox: 0 0 ${totalWidth} ${totalHeight}\n`;
        eps += `%%Title: Barcode ${code}\n`;
        eps += `%%Creator: TSA Barcode Generator\n`;
        eps += `%%EndComments\n\n`;

        // Draw bars (PostScript origin is bottom-left, Y goes up)
        let x = quietZone;
        for (let i = 0; i < binaryStr.length; i++) {
            if (binaryStr[i] === "1") {
                eps += `${x} ${textHeight} ${barWidth} ${barHeight} rectfill\n`;
            }
            x += barWidth;
        }

        // rectfill procedure
        eps = eps.replace(`%%EndComments\n\n`,
            `%%EndComments\n\n/rectfill { /h exch def /w exch def /y exch def /x exch def newpath x y moveto w 0 rlineto 0 h rlineto w neg 0 rlineto closepath fill } def\n\n`
        );

        // Draw text
        eps += `\n/Courier-Bold findfont ${fontSize} scalefont setfont\n`;

        // First digit
        const firstDigitX = quietZone - fontSize * 0.6;
        eps += `${firstDigitX} 0 moveto (${code[0]}) show\n`;

        // Left group
        const leftStart = quietZone + 3 * barWidth;
        const leftGroupWidth = 6 * 7 * barWidth;
        const leftGroupCenter = leftStart + leftGroupWidth / 2;
        const leftText = code.substring(1, 7);
        eps += `(${leftText}) stringwidth pop 2 div neg ${leftGroupCenter} add 0 moveto (${leftText}) show\n`;

        // Right group
        const rightStart = leftStart + leftGroupWidth + 5 * barWidth;
        const rightGroupWidth = 6 * 7 * barWidth;
        const rightGroupCenter = rightStart + rightGroupWidth / 2;
        const rightText = code.substring(7);
        eps += `(${rightText}) stringwidth pop 2 div neg ${rightGroupCenter} add 0 moveto (${rightText}) show\n`;

        eps += `\n%%EOF\n`;

        // Download
        const blob = new Blob([eps], { type: "application/postscript" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
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
                className="max-h-[48px]"
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
