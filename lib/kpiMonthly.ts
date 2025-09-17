export const CHANNELS = ["SHOKU", "STORE", "WEB", "WHOLESALE"] as const;

export type ChannelCode = (typeof CHANNELS)[number];

export type MonthlyRow = {
  month: string;
  channel_code: ChannelCode;
  amount: number;
};

export type ShapedMonthly = {
  month: string;
  byChannel: number[];
  monthTotal: number;
};

export function shapeMonthly(rows: MonthlyRow[], months: string[]): ShapedMonthly[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.month}|${row.channel_code}`;
    map.set(key, row.amount);
  }

  return months.map((month) => {
    const byChannel = CHANNELS.map((channel) => map.get(`${month}|${channel}`) ?? 0);
    const monthTotal = byChannel.reduce((sum, value) => sum + value, 0);
    return { month, byChannel, monthTotal };
  });
}

export function assertChannelSums(shaped: ShapedMonthly[]) {
  const diffs = shaped
    .map((row) => {
      const sum = row.byChannel.reduce((acc, value) => acc + value, 0);
      return { month: row.month, sum, total: row.monthTotal, diff: sum - row.monthTotal };
    })
    .filter((row) => row.diff !== 0);

  if (diffs.length > 0) {
    console.error("[KPI] チャネル合計と月合計の不一致", diffs);
    throw new Error("月別のチャネル合計が月合計と一致していません");
  }

  console.info("[KPI] チェックOK（チャネル合計＝月合計）");
}

export function channelTotals(shaped: ShapedMonthly[]) {
  return CHANNELS.map((channel, idx) => {
    const total = shaped.reduce((sum, row) => sum + row.byChannel[idx], 0);
    return { channel, total };
  });
}
