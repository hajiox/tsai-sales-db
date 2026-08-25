import { Suspense } from "react";
import LabelCheckWorkflow from "../_components/LabelCheckWorkflow";

export default function LabelCheckWorkflowPage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center bg-slate-50 text-sm text-slate-500">読み込み中...</div>}>
      <LabelCheckWorkflow />
    </Suspense>
  );
}
