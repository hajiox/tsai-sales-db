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

type DigitPathCommand =
    | ["M", number, number]
    | ["L", number, number]
    | ["C", number, number, number, number, number, number]
    | ["Z"];

const DIGIT_PATHS: Record<string, DigitPathCommand[]> = {
    "0": [
        ["M", 0.5, 0.94],
        ["C", 0.22, 0.94, 0.14, 0.75, 0.14, 0.5],
        ["C", 0.14, 0.25, 0.22, 0.06, 0.5, 0.06],
        ["C", 0.78, 0.06, 0.86, 0.25, 0.86, 0.5],
        ["C", 0.86, 0.75, 0.78, 0.94, 0.5, 0.94],
        ["Z"],
    ],
    "1": [
        ["M", 0.3, 0.76],
        ["L", 0.5, 0.94],
        ["L", 0.5, 0.08],
        ["M", 0.28, 0.08],
        ["L", 0.72, 0.08],
    ],
    "2": [
        ["M", 0.17, 0.75],
        ["C", 0.2, 0.92, 0.38, 0.98, 0.56, 0.94],
        ["C", 0.8, 0.89, 0.88, 0.74, 0.82, 0.6],
        ["C", 0.74, 0.42, 0.35, 0.31, 0.18, 0.08],
        ["L", 0.86, 0.08],
    ],
    "3": [
        ["M", 0.18, 0.82],
        ["C", 0.31, 0.96, 0.76, 0.96, 0.82, 0.73],
        ["C", 0.86, 0.56, 0.66, 0.48, 0.48, 0.48],
        ["C", 0.7, 0.48, 0.89, 0.39, 0.84, 0.2],
        ["C", 0.78, 0.01, 0.29, 0.02, 0.16, 0.18],
    ],
    "4": [
        ["M", 0.74, 0.08],
        ["L", 0.74, 0.94],
        ["M", 0.14, 0.38],
        ["L", 0.84, 0.38],
        ["M", 0.14, 0.38],
        ["L", 0.68, 0.94],
    ],
    "5": [
        ["M", 0.82, 0.94],
        ["L", 0.24, 0.94],
        ["L", 0.2, 0.56],
        ["C", 0.33, 0.64, 0.72, 0.62, 0.82, 0.44],
        ["C", 0.96, 0.18, 0.58, 0.0, 0.18, 0.16],
    ],
    "6": [
        ["M", 0.8, 0.82],
        ["C", 0.68, 0.98, 0.28, 0.94, 0.2, 0.56],
        ["C", 0.12, 0.2, 0.34, 0.04, 0.58, 0.08],
        ["C", 0.84, 0.12, 0.92, 0.38, 0.78, 0.52],
        ["C", 0.62, 0.68, 0.28, 0.62, 0.2, 0.48],
    ],
    "7": [
        ["M", 0.16, 0.94],
        ["L", 0.86, 0.94],
        ["L", 0.36, 0.08],
    ],
    "8": [
        ["M", 0.5, 0.94],
        ["C", 0.24, 0.94, 0.18, 0.78, 0.22, 0.64],
        ["C", 0.27, 0.45, 0.73, 0.45, 0.78, 0.64],
        ["C", 0.82, 0.78, 0.76, 0.94, 0.5, 0.94],
        ["Z"],
        ["M", 0.5, 0.5],
        ["C", 0.22, 0.5, 0.14, 0.3, 0.2, 0.16],
        ["C", 0.28, 0.0, 0.72, 0.0, 0.8, 0.16],
        ["C", 0.86, 0.3, 0.78, 0.5, 0.5, 0.5],
        ["Z"],
    ],
    "9": [
        ["M", 0.2, 0.18],
        ["C", 0.32, 0.02, 0.72, 0.06, 0.8, 0.44],
        ["C", 0.88, 0.8, 0.66, 0.96, 0.42, 0.92],
        ["C", 0.16, 0.88, 0.08, 0.62, 0.22, 0.48],
        ["C", 0.38, 0.32, 0.72, 0.38, 0.8, 0.52],
    ],
};

const epsNum = (value: number) => Number(value.toFixed(4)).toString();

function digitTextWidth(text: string, digitWidth: number, gap: number): number {
    return text.length * digitWidth + Math.max(0, text.length - 1) * gap;
}

function digitTextToEps(text: string, x: number, y: number, digitWidth: number, digitHeight: number, gap: number, strokeWidth: number): string {
    let eps = `gsave 0 setgray 1 setlinecap 1 setlinejoin ${epsNum(strokeWidth)} setlinewidth\n`;
    let cursorX = x;

    for (const digit of text) {
        const path = DIGIT_PATHS[digit];
        if (!path) continue;

        eps += "newpath\n";
        for (const command of path) {
            if (command[0] === "M") {
                eps += `${epsNum(cursorX + command[1] * digitWidth)} ${epsNum(y + command[2] * digitHeight)} moveto\n`;
            } else if (command[0] === "L") {
                eps += `${epsNum(cursorX + command[1] * digitWidth)} ${epsNum(y + command[2] * digitHeight)} lineto\n`;
            } else if (command[0] === "C") {
                eps += `${epsNum(cursorX + command[1] * digitWidth)} ${epsNum(y + command[2] * digitHeight)} ${epsNum(cursorX + command[3] * digitWidth)} ${epsNum(y + command[4] * digitHeight)} ${epsNum(cursorX + command[5] * digitWidth)} ${epsNum(y + command[6] * digitHeight)} curveto\n`;
            } else {
                eps += "closepath\n";
            }
        }
        eps += "stroke\n";

        cursorX += digitWidth + gap;
    }

    eps += "grestore\n";
    return eps;
}

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

        // Draw digits as custom vector paths. Illustrator can embed this EPS
        // without touching PostScript fonts or font-derived char paths.
        const digitWidth = 6;
        const digitHeight = 12;
        const digitGap = 1.7;
        const digitStroke = 1.2;
        const digitY = 2;

        const d0Width = digitTextWidth(code[0], digitWidth, digitGap);
        const d0x = leftQuiet - 2 - d0Width;
        eps += digitTextToEps(code[0], Math.max(0, d0x), digitY, digitWidth, digitHeight, digitGap, digitStroke);

        const leftStart      = leftQuiet + 3 * barWidth;
        const leftGroupWidth = 6 * 7 * barWidth;
        const leftCenter     = leftStart + leftGroupWidth / 2;
        const leftText       = code.substring(1, 7);
        const leftTextX      = leftCenter - digitTextWidth(leftText, digitWidth, digitGap) / 2;
        eps += digitTextToEps(leftText, leftTextX, digitY, digitWidth, digitHeight, digitGap, digitStroke);

        const rightStart      = leftStart + leftGroupWidth + 5 * barWidth;
        const rightGroupWidth = 6 * 7 * barWidth;
        const rightCenter     = rightStart + rightGroupWidth / 2;
        const rightText       = code.substring(7);
        const rightTextX      = rightCenter - digitTextWidth(rightText, digitWidth, digitGap) / 2;
        eps += digitTextToEps(rightText, rightTextX, digitY, digitWidth, digitHeight, digitGap, digitStroke);

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
