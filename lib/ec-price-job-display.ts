import type { EcPriceJobView } from "./ec-price-codex";

type EcPriceDisplayJob = Pick<EcPriceJobView, "targets" | "status" | "summary" | "errorMessage" | "lp">;

export function getEcPriceJobDisplay(job: EcPriceDisplayJob) {
  const lpOnly = job.targets.length === 0;
  if (!lpOnly) {
    return { lpOnly, summary: job.summary || job.errorMessage, lpMessage: job.lp?.message, details: [] as string[] };
  }

  // A retry contains only its own targets; it must not imply that earlier EC results were reset.
  const summary = job.status === "queued"
    ? "商品LPのみ再実行の開始待ちです。"
    : job.status === "running"
      ? "商品LPのみ再実行中です。"
      : job.status === "cancelled"
        ? "商品LPのみの再実行を停止しました。"
        : job.lp?.status === "updated"
          ? "商品LPの公開反映を確認しました。"
          : "商品LPの更新を完了できませんでした。";
  const lpMessage = job.lp?.status === "updated"
    ? "公開反映確認済み"
    : job.lp?.status === "not_found"
      ? "更新する商品LPを確認できませんでした"
      : "更新を完了できませんでした";
  const details = Array.from(new Set([job.lp?.message, job.errorMessage].filter((message): message is string => Boolean(message))));
  return { lpOnly, summary, lpMessage, details };
}
