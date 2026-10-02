"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Bot, Cable, CircleHelp, FileSpreadsheet, Loader2, PauseCircle } from "lucide-react";
import {
  acquisitionMarks,
  type AcquisitionKind,
  type AcquisitionStatus,
  type AcquisitionMark,
} from "@/lib/web-sales-acquisition-display";

type RouteState = { routes: AcquisitionStatus[]; loading: boolean; error: boolean };
const AcquisitionContext = createContext<RouteState>({ routes: [], loading: true, error: false });

export function AcquisitionRouteProvider({ reportMonth, refreshKey = 0, onLoaded, children }: { reportMonth: string; refreshKey?: number; onLoaded?: (routes: AcquisitionStatus[]) => void; children: ReactNode }) {
  const [state, setState] = useState<RouteState>({ routes: [], loading: true, error: false });

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    setState({ routes: [], loading: true, error: false });
    onLoaded?.([]);
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/web-sales/acquisition/status?reportMonth=${encodeURIComponent(reportMonth)}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("取得経路を確認できません");
        const payload = await response.json();
        if (!Array.isArray(payload.routes)) throw new Error("取得経路を確認できません");
        if (!controller.signal.aborted) {
          setState({ routes: payload.routes, loading: false, error: false });
          onLoaded?.(payload.routes);
        }
      } catch {
        if (!controller.signal.aborted) setState({ routes: [], loading: false, error: true });
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [reportMonth, refreshKey, onLoaded]);

  return <AcquisitionContext.Provider value={state}>{children}</AcquisitionContext.Provider>;
}

const ICONS = {
  api: Cable,
  bridge: Bot,
  manual: FileSpreadsheet,
  none: CircleHelp,
  unknown: CircleHelp,
  waiting: PauseCircle,
};
const COLORS = {
  api: "border-sky-200 bg-sky-50 text-sky-800",
  bridge: "border-violet-200 bg-violet-50 text-violet-800",
  manual: "border-slate-200 bg-slate-50 text-slate-700",
  none: "border-slate-200 bg-slate-50 text-slate-500",
  unknown: "border-slate-200 bg-slate-50 text-slate-500",
  waiting: "border-amber-200 bg-amber-50 text-amber-800",
};

export function AcquisitionRouteBadge({ mark }: { mark: AcquisitionMark }) {
  const Icon = ICONS[mark.route];
  return (
    <span title={mark.title} aria-label={`${mark.label}。${mark.title}`} className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-4 ${COLORS[mark.route]}`}>
      <Icon size={12} className="shrink-0" aria-hidden="true" />
      <span>{mark.label}</span>
    </span>
  );
}

export function AcquisitionRouteMark({ kind, channel, className = "" }: { kind: AcquisitionKind; channel: string; className?: string }) {
  const { routes, loading, error } = useContext(AcquisitionContext);
  const status = routes.find((route) => route.kind === kind && route.channel === channel);
  if (loading) return <span className={`inline-flex items-center gap-1 text-[10px] text-slate-400 ${className}`}><Loader2 size={11} className="animate-spin" aria-hidden="true" />経路確認中</span>;
  if (error || !status) return <span className={`text-[10px] text-slate-500 ${className}`} title="取得経路の状態を確認できませんでした">取得経路未確認</span>;
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      {acquisitionMarks(status).map((mark, index) => <AcquisitionRouteBadge key={`${index}:${mark.label}`} mark={mark} />)}
    </span>
  );
}
