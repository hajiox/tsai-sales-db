import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatDateJST = (date: Date) => {
  const y = date.getFullYear()
  const m = ("0" + (date.getMonth() + 1)).slice(-2)
  const d = ("0" + date.getDate()).slice(-2)
  return `${y}-${m}-${d}`
}
