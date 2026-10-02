export function salesAcquisitionRoute(metadata: Record<string, unknown> | null | undefined): "api" | "bridge" | "manual" | "unknown" {
  if (!metadata) return "unknown";
  if (metadata.acquisitionPath === "api" || metadata.acquisition_path === "api") return "api";
  if (metadata.source === "codex_app_manual" || metadata.import_route === "codex_app_manual" || metadata.import_route === "codex_desktop_manual") return "manual";
  if (metadata.codex_job_id) return "bridge";
  if (metadata.import_source === "csv" || metadata.source === "manual_csv" || metadata.acquisitionPath === "manual") return "manual";
  return "unknown";
}

export function financeAcquisitionRoute(metadata: Record<string,unknown> | null | undefined, sourceJobId?: string | null) {
  if (!metadata) return sourceJobId ? "bridge" : "unknown";
  if (metadata.acquisition_source === "official_api" || metadata.execution_route === "official_api" || metadata.execution_route === "google_ads_api") return "api";
  if (metadata.execution_runtime && typeof metadata.execution_runtime==="object" && "workerId" in metadata.execution_runtime) return "bridge";
  return salesAcquisitionRoute({...metadata,...(sourceJobId ? {codex_job_id:sourceJobId} : {})});
}

export function isPersistedAcquisition(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && (result as Record<string, unknown>).persisted === true);
}

export function safeAcquisitionError(error: unknown): string {
  const code = error && typeof error === "object" ? (error as { code?: string; channel?: string }).code : undefined;
  if (code && /^[a-z0-9_]{1,100}$/i.test(code)) return `公式API確認: ${code}`;
  const message = error instanceof Error ? error.message : "取得処理を完了できません";
  // A provider response can contain credentials, buyer information or signed URLs.
  if (/[A-Za-z0-9]{30,}|https?:\/\/|Bearer\s|access_token|refresh_token|client_secret/i.test(message)) return "公式APIの接続・権限または取得結果を確認してください";
  return message.replace(/[\r\n]/g, " ").slice(0,300);
}
