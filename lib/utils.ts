// /lib/utils.ts ver.2 (formatCurrency追加版)
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
 return twMerge(clsx(inputs))
}

// 数値をカンマ区切りにする関数
export const nf = (num: number | null | undefined): string => {
 if (num === null || num === undefined) {
   return '0';
 }
 return num.toLocaleString();
};

// 日付をYYYY-MM-DD形式にフォーマット（タイムゾーン考慮なし）
export const formatDateJST = (date: Date): string => {
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const day = String(date.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
};

// 金額をフォーマットする関数
export const formatCurrency = (amount: number | null | undefined): string => {
 if (amount === null || amount === undefined) {
   return '¥0';
 }
 return `¥${amount.toLocaleString()}`;
};
