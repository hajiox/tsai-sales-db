const PRICE_PRECISION = 4;

export function roundRecipePrice(value: number, precision = PRICE_PRECISION): number {
    const factor = 10 ** precision;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function convertRecipePrice(
    value: number,
    inputIncludesTax: boolean,
    storedIncludesTax: boolean,
    taxRatePercent: number,
): number {
    if (!Number.isFinite(value)) return value;
    if (inputIncludesTax === storedIncludesTax) return roundRecipePrice(value);

    const multiplier = 1 + taxRatePercent / 100;
    return roundRecipePrice(inputIncludesTax ? value / multiplier : value * multiplier);
}

export function recipePriceForDisplay(
    storedValue: number | null | undefined,
    displayIncludesTax: boolean,
    storedIncludesTax: boolean,
    taxRatePercent: number,
): number | null {
    if (storedValue === null || storedValue === undefined || !Number.isFinite(storedValue)) return null;
    return convertRecipePrice(storedValue, storedIncludesTax, displayIncludesTax, taxRatePercent);
}

export function formatRecipePrice(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "";
    return new Intl.NumberFormat("ja-JP", {
        minimumFractionDigits: 0,
        maximumFractionDigits: PRICE_PRECISION,
        useGrouping: false,
    }).format(roundRecipePrice(value));
}
