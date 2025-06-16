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
