// lib/utils.ts

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ★この関数を追加
export const nf = (num: number | null | undefined): string => {
  if (num === null || num === undefined) {
    return '0';
  }
  return num.toLocaleString();
};
