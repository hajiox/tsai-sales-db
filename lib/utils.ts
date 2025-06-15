import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

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

// ★ 見つからなかった 'formatDateJST' 関数をここに追加
export const formatDateJST = (date: Date): string => {
  return format(date, 'yyyy-MM-dd HH:mm:ss', { locale: ja });
};
