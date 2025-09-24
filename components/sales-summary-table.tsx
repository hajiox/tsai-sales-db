"use client";

import React from "react";
import { nf } from "@/lib/utils";

type ValueConfig = {
  key?: string;
  source?: "daily" | "monthly";
  compute?: () => number | null;
  unit?: string;
  format?: "currency" | "number";
};

type RowConfig = {
  label: string;
  daily?: ValueConfig;
  dailyCount?: ValueConfig;
  monthly?: ValueConfig;
  monthlyCount?: ValueConfig;
  target?: ValueConfig;
  prev?: ValueConfig;
  highlight?: boolean;
};

type SectionConfig = {
  title: string;
  rows: RowConfig[];
};

interface SalesSummaryTableProps {
  dailyData: Record<string, any> | null;
  monthlyData: Record<string, any> | null;
  isLoading: boolean;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return null;
};

const formatValue = (value: number | null, config?: ValueConfig): string => {
  if (value === null) return "-";
  const unit = config?.unit ?? "";
  const formatType = config?.format ?? "currency";
  const rounded = formatType === "currency" ? Math.round(value) : value;
  const formatted = nf(rounded);
  return `${formatted}${unit}`;
};

const formatDiff = (value: number | null, config?: ValueConfig): string => {
  if (value === null) return "-";
  if (value === 0) {
    return `±${formatValue(0, config)}`;
  }
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatValue(Math.abs(value), config)}`;
};

const formatPercent = (value: number | null): string => {
  if (value === null) return "-";
  return `${value.toFixed(1)}%`;
};

const SalesSummaryTable: React.FC<SalesSummaryTableProps> = ({
  dailyData,
  monthlyData,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="space-y-4 animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-48" />
          {[...Array(6)].map((_, index) => (
            <div key={index} className="h-9 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const daily = dailyData ?? {};
  const monthly = monthlyData ?? {};

  const sumFrom = (source: "daily" | "monthly", keys: string[]): number | null => {
    const dataset = source === "daily" ? daily : monthly;
    let sum = 0;
    let hasValue = false;
    for (const key of keys) {
      const value = toNumber(dataset?.[key]);
      if (value !== null) {
        sum += value;
        hasValue = true;
      }
    }
    return hasValue ? sum : null;
  };

  const getValue = (config?: ValueConfig): number | null => {
    if (!config) return null;
    if (config.compute) {
      const computed = config.compute();
      return computed === null || computed === undefined ? null : computed;
    }
    if (!config.key) return null;
    const source = config.source ?? "daily";
    const dataset = source === "daily" ? daily : monthly;
    return toNumber(dataset?.[config.key]);
  };

  const calcAchievementRate = (
    actual: number | null,
    target: number | null
  ): number | null => {
    if (actual === null || target === null || target === 0) return null;
    return (actual / target) * 100;
  };

  const calcYoYRate = (
    actual: number | null,
    previous: number | null
  ): number | null => {
    if (actual === null || previous === null || previous === 0) return null;
    return (actual / previous) * 100;
  };

  const webAmountKeys = [
    "amazon_amount",
    "rakuten_amount",
    "yahoo_amount",
    "mercari_amount",
    "base_amount",
    "qoo10_amount",
  ];

  const webMonthlyAmountKeys = [
    "m_amazon_total",
    "m_rakuten_total",
    "m_yahoo_total",
    "m_mercari_total",
    "m_base_total",
    "m_qoo10_total",
  ];

  const webCountKeys = [
    "amazon_count",
    "rakuten_count",
    "yahoo_count",
    "mercari_count",
    "base_count",
    "qoo10_count",
  ];

  const webMonthlyCountKeys = [
    "m_amazon_count_total",
    "m_rakuten_count_total",
    "m_yahoo_count_total",
    "m_mercari_count_total",
    "m_base_count_total",
    "m_qoo10_count_total",
  ];

  const sections: SectionConfig[] = [
    {
      title: "店舗",
      rows: [
        {
          label: "フロア売上",
          daily: { key: "floor_sales", unit: "円" },
          monthly: { key: "m_floor_total", source: "monthly", unit: "円" },
          target: { key: "m_floor_target", source: "monthly", unit: "円" },
          prev: { key: "m_floor_prev_year", source: "monthly", unit: "円" },
          highlight: true,
        },
        {
          label: "入金額",
          daily: { key: "cash_income", unit: "円" },
          monthly: { key: "m_cash_income_total", source: "monthly", unit: "円" },
          target: { key: "m_cash_income_target", source: "monthly", unit: "円" },
          prev: { key: "m_cash_income_prev_year", source: "monthly", unit: "円" },
        },
        {
          label: "レジ通過人数",
          daily: { key: "register_count", unit: "人", format: "number" },
          monthly: {
            key: "m_register_count_total",
            source: "monthly",
            unit: "人",
            format: "number",
          },
          target: {
            key: "m_register_count_target",
            source: "monthly",
            unit: "人",
            format: "number",
          },
          prev: {
            key: "m_register_count_prev_year",
            source: "monthly",
            unit: "人",
            format: "number",
          },
        },
      ],
    },
    {
      title: "EC売上",
      rows: [
        {
          label: "Amazon",
          daily: { key: "amazon_amount", unit: "円" },
          dailyCount: {
            key: "amazon_count",
            unit: "件",
            format: "number",
          },
          monthly: { key: "m_amazon_total", source: "monthly", unit: "円" },
          monthlyCount: {
            key: "m_amazon_count_total",
            source: "monthly",
            unit: "件",
            format: "number",
          },
          target: { key: "m_amazon_target", source: "monthly", unit: "円" },
          prev: { key: "m_amazon_prev_year", source: "monthly", unit: "円" },
        },
        {
          label: "楽天",
          daily: { key: "rakuten_amount", unit: "円" },
          dailyCount: {
            key: "rakuten_count",
            unit: "件",
            format: "number",
          },
          monthly: { key: "m_rakuten_total", source: "monthly", unit: "円" },
          monthlyCount: {
            key: "m_rakuten_count_total",
            source: "monthly",
            unit: "件",
            format: "number",
          },
          target: { key: "m_rakuten_target", source: "monthly", unit: "円" },
          prev: { key: "m_rakuten_prev_year", source: "monthly", unit: "円" },
        },
        {
          label: "Yahoo!",
          daily: { key: "yahoo_amount", unit: "円" },
          dailyCount: {
            key: "yahoo_count",
            unit: "件",
            format: "number",
          },
          monthly: { key: "m_yahoo_total", source: "monthly", unit: "円" },
          monthlyCount: {
            key: "m_yahoo_count_total",
            source: "monthly",
            unit: "件",
            format: "number",
          },
          target: { key: "m_yahoo_target", source: "monthly", unit: "円" },
          prev: { key: "m_yahoo_prev_year", source: "monthly", unit: "円" },
        },
        {
          label: "メルカリ",
          daily: { key: "mercari_amount", unit: "円" },
          dailyCount: {
            key: "mercari_count",
            unit: "件",
            format: "number",
          },
          monthly: { key: "m_mercari_total", source: "monthly", unit: "円" },
          monthlyCount: {
            key: "m_mercari_count_total",
            source: "monthly",
            unit: "件",
            format: "number",
          },
          target: { key: "m_mercari_target", source: "monthly", unit: "円" },
          prev: { key: "m_mercari_prev_year", source: "monthly", unit: "円" },
        },
        {
          label: "BASE",
          daily: { key: "base_amount", unit: "円" },
          dailyCount: {
            key: "base_count",
            unit: "件",
            format: "number",
          },
          monthly: { key: "m_base_total", source: "monthly", unit: "円" },
          monthlyCount: {
            key: "m_base_count_total",
            source: "monthly",
            unit: "件",
            format: "number",
          },
          target: { key: "m_base_target", source: "monthly", unit: "円" },
          prev: { key: "m_base_prev_year", source: "monthly", unit: "円" },
        },
        {
          label: "Qoo10",
          daily: { key: "qoo10_amount", unit: "円" },
          dailyCount: {
            key: "qoo10_count",
            unit: "件",
            format: "number",
          },
          monthly: { key: "m_qoo10_total", source: "monthly", unit: "円" },
          monthlyCount: {
            key: "m_qoo10_count_total",
            source: "monthly",
            unit: "件",
            format: "number",
          },
          target: { key: "m_qoo10_target", source: "monthly", unit: "円" },
          prev: { key: "m_qoo10_prev_year", source: "monthly", unit: "円" },
        },
        {
          label: "EC合計",
          daily: {
            compute: () => sumFrom("daily", webAmountKeys),
            unit: "円",
          },
          monthly: {
            compute: () => {
              const total = toNumber(monthly?.m_web_total);
              if (total !== null) return total;
              return sumFrom("monthly", webMonthlyAmountKeys);
            },
            unit: "円",
          },
          monthlyCount: {
            compute: () => sumFrom("monthly", webMonthlyCountKeys),
            unit: "件",
            format: "number",
          },
          target: { key: "m_web_target", source: "monthly", unit: "円" },
          prev: { key: "m_web_prev_year", source: "monthly", unit: "円" },
          highlight: true,
        },
        {
          label: "EC販売件数",
          daily: {
            compute: () => sumFrom("daily", webCountKeys),
            unit: "件",
            format: "number",
          },
          monthly: {
            compute: () => sumFrom("monthly", webMonthlyCountKeys),
            unit: "件",
            format: "number",
          },
          target: {
            key: "m_ec_count_target",
            source: "monthly",
            unit: "件",
            format: "number",
          },
          prev: {
            key: "m_ec_count_prev_year",
            source: "monthly",
            unit: "件",
            format: "number",
          },
        },
      ],
    },
    {
      title: "総合",
      rows: [
        {
          label: "全体売上（日計）",
          daily: {
            compute: () => {
              const floor = toNumber(daily.floor_sales);
              const web = sumFrom("daily", webAmountKeys);
              if (floor === null && web === null) return null;
              return (floor ?? 0) + (web ?? 0);
            },
            unit: "円",
          },
          monthly: {
            key: "m_grand_total",
            source: "monthly",
            unit: "円",
          },
          target: {
            key: "m_grand_target",
            source: "monthly",
            unit: "円",
          },
          prev: {
            key: "m_grand_prev_year",
            source: "monthly",
            unit: "円",
          },
          highlight: true,
        },
      ],
    },
  ];

  const totalTarget = getValue({
    key: "m_grand_target",
    source: "monthly",
  });
  const totalActual = getValue({
    key: "m_grand_total",
    source: "monthly",
  });
  const remainingAmount =
    totalTarget !== null && totalActual !== null
      ? Math.max(totalTarget - totalActual, 0)
      : null;
  const remainingPercent =
    totalTarget !== null && totalActual !== null && totalTarget !== 0
      ? Math.max(100 - (totalActual / totalTarget) * 100, 0)
      : null;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200 space-y-4">
      {totalTarget !== null && (
        <div className="text-center text-sm md:text-base font-semibold text-rose-600">
          目標{formatValue(totalTarget, { unit: "円" })}まで残り
          {remainingPercent !== null
            ? ` ${remainingPercent.toFixed(1)}%`
            : ""}
          {remainingAmount !== null ? `（${formatValue(remainingAmount, { unit: "円" })}）` : ""}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-[960px] w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="bg-slate-800 text-white px-3 py-2 text-left border border-slate-300">
                区分 / 項目
              </th>
              <th className="bg-slate-800 text-white px-3 py-2 text-right border border-slate-300">
                日計
              </th>
              <th className="bg-slate-800 text-white px-3 py-2 text-right border border-slate-300">
                月累計
              </th>
              <th className="bg-slate-800 text-white px-3 py-2 text-right border border-slate-300">
                月目標
              </th>
              <th className="bg-slate-800 text-white px-3 py-2 text-right border border-slate-300">
                目標まで
              </th>
              <th className="bg-slate-800 text-white px-3 py-2 text-right border border-slate-300">
                達成率
              </th>
              <th className="bg-slate-800 text-white px-3 py-2 text-right border border-slate-300">
                前年同月
              </th>
              <th className="bg-slate-800 text-white px-3 py-2 text-right border border-slate-300">
                前年差
              </th>
              <th className="bg-slate-800 text-white px-3 py-2 text-right border border-slate-300">
                前年比
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <React.Fragment key={section.title}>
                <tr>
                  <td
                    className="bg-slate-100 px-3 py-2 text-left text-slate-700 font-semibold border border-slate-300"
                    colSpan={9}
                  >
                    {section.title}
                  </td>
                </tr>
                {section.rows.map((row) => {
                  const dailyValue = getValue(row.daily);
                  const monthlyValue = getValue(row.monthly);
                  const targetValue = getValue(row.target);
                  const prevValue = getValue(row.prev);
                  const remainingToTarget =
                    targetValue !== null && monthlyValue !== null
                      ? targetValue - monthlyValue
                      : null;
                  const achievementRate = calcAchievementRate(
                    monthlyValue,
                    targetValue
                  );
                  const yoyDiff =
                    monthlyValue !== null && prevValue !== null
                      ? monthlyValue - prevValue
                      : null;
                  const yoyRate = calcYoYRate(monthlyValue, prevValue);
                  const dailyCountValue = getValue(row.dailyCount);
                  const monthlyCountValue = getValue(row.monthlyCount);

                  const rowClass = row.highlight
                    ? "bg-amber-50"
                    : "bg-white";

                  return (
                    <tr key={row.label} className={rowClass}>
                      <td className="border border-slate-300 px-3 py-2 text-left text-slate-800">
                        {row.label}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right align-top">
                        <div className={row.highlight ? "font-semibold" : undefined}>
                          {formatValue(dailyValue, row.daily)}
                        </div>
                        {dailyCountValue !== null && (
                          <div className="text-[11px] text-slate-500">
                            {formatValue(dailyCountValue, row.dailyCount)}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right align-top">
                        <div className={row.highlight ? "font-semibold" : undefined}>
                          {formatValue(monthlyValue, row.monthly)}
                        </div>
                        {monthlyCountValue !== null && (
                          <div className="text-[11px] text-slate-500">
                            {formatValue(monthlyCountValue, row.monthlyCount)}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatValue(targetValue, row.target)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatDiff(remainingToTarget, row.target)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatPercent(achievementRate)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatValue(prevValue, row.prev)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatDiff(yoyDiff, row.prev)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatPercent(yoyRate)}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 text-right">
        ※ 目標・前年実績が未設定の場合は「-」で表示されます。
      </p>
    </div>
  );
};

export default SalesSummaryTable;
