export const EC_PRICE_RESERVATION_SCHEDULED_AT = "9999-12-31T23:59:59.000Z";

export type EcPriceDispatchMode = "immediate" | "reserved" | "batch";

export function normalizeEcPriceDispatchMode(value: unknown): EcPriceDispatchMode {
  return value === "reserved" ? "reserved" : "immediate";
}

export function isReservedEcPriceJob(
  status: unknown,
  parameters: unknown,
) {
  const object = parameters && typeof parameters === "object" && !Array.isArray(parameters)
    ? parameters as Record<string, unknown>
    : {};
  return status === "queued" && object.dispatchMode === "reserved";
}
