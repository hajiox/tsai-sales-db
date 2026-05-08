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

// ガードバー判定：EAN-13の固定ビット位置
// start guard  : bits  0 -  2  (3 bits: "101")
// center guard : bits 45 - 49  (5 bits: "01010") = 3 + 6x7
// end guard    : bits 92 - 94  (3 bits: "101")   = 45 + 5 + 6x7
const GUARD_CENTER_START = 3 + 6 * 7;            // 45
const GUARD_CENTER_END   = GUARD_CENTER_START + 4; // 49
const GUARD_END_START    = GUARD_CENTER_END + 1 + 6 * 7; // 92
const GUARD_END_END      = GUARD_END_START + 2;   // 94

function isGuardBit(i: number): boolean {
    return (i >= 0 && i <= 2) ||
           (i >= GUARD_CENTER_START && i <= GUARD_CENTER_END) ||
           (i >= GUARD_END_START    && i <= GUARD_END_END);
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

        const barWidth    = 2 * scale;
        const barHeight   = 70 * scale;      // 通常バーの高さ
        const guardExtra  = 10 * scale;      // ガードバーが下に突き出す追加分
        const guardHeight = barHeight + guardExtra;
        const quietZone   = 10 * scale;
        const fontSize    = 12 * scale;
        const textPad     = 2 * scale;

        const encoded = encodeEAN13(code);
        if (encoded.length === 0) return;

        const binaryStr = encoded.join("");

        // 先頭1桁のための左側スペース
        const firstDigitWidth = fontSize * 1.0;
        const totalWidth  = quietZone + firstDigitWidth + binaryStr.length * barWidth + quietZone;
        const totalHeight = guardHeight + textPad + fontSize + 4 * scale;

        canvas.width  = totalWidth;
        canvas.height = totalHeight;

        // 白背景
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // バー描画（ガードバーは guardHeight、通常バーは barHeight）
        const barsOriginX = quietZone + firstDigitWidth;
        let x = barsOriginX;
        for (let i = 0; i < binaryStr.length; i++) {
            const h = isGuardBit(i) ? guardHeight : barHeight;
            if (binaryStr[i] === "1") {
                ctx.fillStyle = "#000000";
                ctx.fillRect(x, 0, barWidth, h);
            }
            x += barWidth;
        }

        // テキスト描画（ガードバー延長部の下に揃える）
        ctx.fillStyle    = "#000000";
        ctx.textBaseline = "top";
        const textY = guardHeight + textPad;
        ctx.font = `${fontSize}px 'Courier New', monospace`;

        // 先頭1桁: start guard の左外側
        ctx.textAlign = "right";
        ctx.fillText(code[0], barsOriginX - 1 * scale, textY);

        // 左グループ (digits 1-6): start guard(3bits) 直後 〜 center guard 直前
        const leftGroupXStart = barsOriginX + 3 * barWidth;
        const leftGroupXEnd   = barsOriginX + (3 + 6 * 7) * barWidth;
        ctx.textAlign = "center";
        ctx.fillText(code.substring(1, 7), (leftGroupXStart + leftGroupXEnd) / 2, textY);

        // 右グループ (digits 7-12): center guard(5bits) 直後 〜 end guard 直前
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

        const barWidth  = 2;   // points
        const barHeight = 70;
        const guardExtra = 10; // ガードバー延長分
        const guardBarH = barHeight + guardExtra;
        const quietZone = 10;
        const fontSize  = 14;
        const textHeight = fontSize + 8;

        const encoded = encodeEAN13(code);
        if (encoded.length === 0) return;

        const binaryStr = encoded.join("");
        const firstDigitWidth = fontSize;
        const totalWidth  = quietZone + firstDigitWidth + binaryStr.length * barWidth + quietZone;
        const totalHeight = guardBarH + textHeight;

        let eps = `%!PS-Adobe-3.0 EPSF-3.0\n`;
        eps += `%%BoundingBox: 0 0 ${totalWidth} ${totalHeight}\n`;
        eps += `%%Title: Barcode ${code}\n`;
        eps += `%%Creator: TSA Barcode Generator\n`;
        eps += `%%EndComments\n\n`;
        eps += `/rf { /h exch def /w exch def /y exch def /x exch def newpath x y moveto w 0 rlineto 0 h rlineto w neg 0 rlineto closepath fill } def\n\n`;

        // バー描画（PostScriptはY軸が下から上）
        let x = quietZone + firstDigitWidth;
        for (let i = 0; i < binaryStr.length; i++) {
            if (binaryStr[i] === "1") {
                const h = isGuardBit(i) ? guardBarH : barHeight;
                const yBase = textHeight; // テキスト領域の上からバー開始
                eps += `${x} ${yBase} ${barWidth} ${h} rf\n`;
            }
            x += barWidth;
        }

        // テキスト描画
        eps += `\n/Courier findfont ${fontSize} scalefont setfont\n`;

        // 先頭1桁
        const d0x = quietZone + firstDigitWidth - fontSize * 0.8;
        eps += `${d0x} 0 moveto (${code[0]}) show\n`;

        // 左グループ
        const leftStart      = quietZone + firstDigitWidth + 3 * barWidth;
        const leftGroupWidth = 6 * 7 * barWidth;
        const leftCenter     = leftStart + leftGroupWidth / 2;
        const leftText       = code.substring(1, 7);
        eps += `(${leftText}) stringwidth pop 2 div neg ${leftCenter} add 0 moveto (${leftText}) show\n`;

        // 右グループ
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
