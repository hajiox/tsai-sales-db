export const REQUIRED_TSA_CODEX_BRIDGE_VERSION = "1.9.61";

const RETIRED_LEGACY_WORKER_IDS = new Set([
  "tsa-office-01-headless",
]);

export function isRetiredLegacyTsaCodexBridge(workerId: string, bridgeVersion: string) {
  return RETIRED_LEGACY_WORKER_IDS.has(workerId)
    && bridgeVersion !== REQUIRED_TSA_CODEX_BRIDGE_VERSION;
}
