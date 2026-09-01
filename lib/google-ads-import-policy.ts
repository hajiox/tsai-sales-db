export type GoogleAdsCostRow = {
  campaign_name: string | null;
  asset_group_name: string | null;
  series_code: number | null;
  cost_micros: number | string | null;
};

export type GoogleAdsCostClassification = {
  mappedMicrosBySeries: Map<number, number>;
  sharedShoppingMicros: number;
  excludedStoreMicros: number;
  unknownGroupNames: string[];
};

export function classifyGoogleAdsCostRows(rows: GoogleAdsCostRow[]): GoogleAdsCostClassification {
  const mappedMicrosBySeries = new Map<number, number>();
  const unknownGroupNames = new Set<string>();
  let sharedShoppingMicros = 0;
  let excludedStoreMicros = 0;

  for (const row of rows) {
    const costMicros = Math.max(0, Number(row.cost_micros || 0));
    if (!Number.isFinite(costMicros) || costMicros <= 0) continue;

    if (isStoreVisitCampaign(row)) {
      excludedStoreMicros += costMicros;
      continue;
    }
    if (isSharedShoppingCampaign(row)) {
      sharedShoppingMicros += costMicros;
      continue;
    }

    const seriesCode = Number(row.series_code || 0);
    if (seriesCode > 0) {
      mappedMicrosBySeries.set(
        seriesCode,
        (mappedMicrosBySeries.get(seriesCode) || 0) + costMicros,
      );
      continue;
    }

    unknownGroupNames.add(displayGroupName(row));
  }

  return {
    mappedMicrosBySeries,
    sharedShoppingMicros,
    excludedStoreMicros,
    unknownGroupNames: [...unknownGroupNames].sort((a, b) => a.localeCompare(b, "ja")),
  };
}

export function allocateIntegerTotal(
  total: number,
  weights: Map<number, number>,
): Map<number, number> {
  const roundedTotal = Math.max(0, Math.round(total));
  const positiveWeights = [...weights]
    .filter(([seriesCode, weight]) => seriesCode > 0 && Number.isFinite(weight) && weight > 0)
    .sort(([left], [right]) => left - right);
  const weightTotal = positiveWeights.reduce((sum, [, weight]) => sum + weight, 0);
  if (roundedTotal === 0 || weightTotal <= 0) return new Map();

  const allocations = positiveWeights.map(([seriesCode, weight]) => {
    const exact = roundedTotal * weight / weightTotal;
    return { seriesCode, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = roundedTotal - allocations.reduce((sum, item) => sum + item.value, 0);
  allocations
    .sort((left, right) => right.remainder - left.remainder || left.seriesCode - right.seriesCode)
    .forEach((item) => {
      if (remaining <= 0) return;
      item.value += 1;
      remaining -= 1;
    });

  return new Map(
    allocations
      .sort((left, right) => left.seriesCode - right.seriesCode)
      .map((item) => [item.seriesCode, item.value]),
  );
}

export function microsToRoundedYen(micros: number): number {
  return Math.round(Math.max(0, micros) / 1_000_000);
}

function isStoreVisitCampaign(row: GoogleAdsCostRow): boolean {
  const text = searchableName(row);
  return /(?:食ブラ|食のブランド館)/i.test(text)
    && /(?:来店|地図\s*cv|店舗)/i.test(text);
}

function isSharedShoppingCampaign(row: GoogleAdsCostRow): boolean {
  const text = searchableName(row);
  return /(?:\[shopping\]|標準ショッピング)/i.test(text)
    && /(?:base|注文上位)/i.test(text);
}

function searchableName(row: GoogleAdsCostRow): string {
  return `${row.campaign_name || ""} ${row.asset_group_name || ""}`.trim();
}

function displayGroupName(row: GoogleAdsCostRow): string {
  return String(row.asset_group_name || row.campaign_name || "名称不明の広告グループ").trim();
}
