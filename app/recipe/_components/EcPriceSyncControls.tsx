"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  buildEcPriceCodexDeepLink,
  buildEcPriceCodexPrompt,
  EC_PRICE_TARGETS,
  getEcPriceTargetLabel,
  type EcPriceCodexRequest,
  type EcPriceTarget,
} from "@/lib/ec-price-codex";

const TARGET_STYLES: Record<EcPriceTarget, string> = {
  amazon: "bg-orange-500 hover:bg-orange-600",
  rakuten: "bg-red-500 hover:bg-red-600",
  yahoo: "bg-purple-600 hover:bg-purple-700",
  mercari: "bg-sky-500 hover:bg-sky-600",
  base: "bg-emerald-600 hover:bg-emerald-700",
  qoo10: "bg-pink-500 hover:bg-pink-600",
  tiktok: "bg-teal-500 hover:bg-teal-600",
};

interface EcPriceSyncControlsProps
  extends Omit<EcPriceCodexRequest, "targets"> {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
}

export default function EcPriceSyncControls({
  hasUnsavedChanges,
  isSaving,
  ...recipeRequest
}: EcPriceSyncControlsProps) {
  const hasPrice =
    Number.isFinite(recipeRequest.sellingPriceInclTax) &&
    recipeRequest.sellingPriceInclTax > 0;
  const disabled = hasUnsavedChanges || isSaving || !hasPrice;

  const launchCodex = (targets: EcPriceTarget[]) => {
    if (disabled) return;

    const targetLabel = getEcPriceTargetLabel(targets);
    const productName = recipeRequest.ecProductName || recipeRequest.recipeName;
    const confirmed = window.confirm(
      [
        `${targetLabel}へ価格変更タスクを渡します。`,
        "",
        `商品: ${productName}`,
        `EC販売価格（税込）: ¥${recipeRequest.sellingPriceInclTax.toLocaleString("ja-JP")}`,
        "",
        "Codexが開いたら指示内容を確認し、送信してください。",
      ].join("\n"),
    );

    if (!confirmed) return;

    const request: EcPriceCodexRequest = { ...recipeRequest, targets };
    if (navigator.clipboard) {
      void navigator.clipboard
        .writeText(buildEcPriceCodexPrompt(request))
        .catch(() => undefined);
    }
    window.location.assign(buildEcPriceCodexDeepLink(request));
    toast.success("Codexに価格変更の指示をセットしました。内容を確認して送信してください。");
  };

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            EC価格反映
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            保存済みの税込価格を、ローカルCodexの価格改定Skillへ渡します。
          </p>
        </div>
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      </div>

      <div className="flex flex-wrap gap-2">
        {EC_PRICE_TARGETS.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => launchCodex([target.id])}
            disabled={disabled}
            title={hasUnsavedChanges ? "先にレシピを保存してください" : `${target.label}へ反映`}
            className={`rounded px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 ${TARGET_STYLES[target.id]}`}
          >
            {target.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => launchCodex(EC_PRICE_TARGETS.map((target) => target.id))}
        disabled={disabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        全て反映
      </button>

      {hasUnsavedChanges ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          価格を含む変更を先に保存すると、反映ボタンが有効になります。
        </p>
      ) : !hasPrice ? (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          販売価格を登録・保存すると利用できます。
        </p>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Codexが開いたら内容を確認して送信してください。対象商品を確定できない場合は変更を停止します。
        </p>
      )}
    </section>
  );
}
