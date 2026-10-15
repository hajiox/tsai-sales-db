"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";

const RANGE_PRESETS = [
  { label: "1ヶ月", value: "1m" },
  { label: "3ヶ月", value: "3m" },
  { label: "6ヶ月", value: "6m" },
  { label: "12ヶ月", value: "12m" },
] as const;

type RangePreset = (typeof RANGE_PRESETS)[number]["value"];

type PeriodTotal = {
  period_month: string;
  platform?: string;
  spend: number | null;
  revenue: number | null;
  roas: number | null;
};

type MonthlySummaryRow = {
  period_month?: string;
  campaign?: string;
  portfolio?: string | null;
  spend?: number | null;
  revenue?: number | null;
  roas?: number | null;
};

type RedFlagRow = {
  platform?: string;
  campaign?: string;
  period_curr?: string;
  period_prev?: string;
  spend_curr?: number | null;
  spend_prev?: number | null;
  revenue_curr?: number | null;
  revenue_prev?: number | null;
};

const numberFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

export default function AdsDashboardPage() {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();
  const [range, setRange] = useState<RangePreset>("3m");
  const [isLoading, setIsLoading] = useState(true);
  const [periodTotals, setPeriodTotals] = useState<PeriodTotal[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryRow[]>([]);
  const [redFlags, setRedFlags] = useState<RedFlagRow[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      const [totalsRes, summaryRes, redFlagRes] = await Promise.all([
        supabase
          .from("ads.v_period_totals")
          .select("*")
          .eq("platform", "amazon")
          .order("period_month", { ascending: true }),
        supabase
          .from("ads.v_monthly_summary")
          .select("*")
          .eq("platform", "amazon")
          .order("revenue", { ascending: false }),
        supabase
          .from("ads.v_red_flags")
          .select("*")
          .eq("platform", "amazon")
          .limit(20),
      ]);

      if (!isMounted) return;

      if (totalsRes.error) {
        toast({
          title: "期間集計の取得に失敗しました",
          description: totalsRes.error.message,
          variant: "destructive",
        });
      }
      if (summaryRes.error) {
        toast({
          title: "キャンペーン一覧の取得に失敗しました",
          description: summaryRes.error.message,
          variant: "destructive",
        });
      }
      if (redFlagRes.error) {
        toast({
          title: "赤旗データの取得に失敗しました",
          description: redFlagRes.error.message,
          variant: "destructive",
        });
      }

      setPeriodTotals(totalsRes.data ?? []);
      setMonthlySummary(summaryRes.data ?? []);
      setRedFlags(redFlagRes.data ?? []);
      setIsLoading(false);
    };

    void fetchData();

    return () => {
      isMounted = false;
    };
  }, [supabase, toast]);

  const filteredTotals = useMemo(() => {
    if (!periodTotals.length) return [] as PeriodTotal[];
    const months = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 } as const;
    const limit = months[range];
    return periodTotals.slice(-limit);
  }, [periodTotals, range]);

  const latestTotal = useMemo(() => {
    return periodTotals.length ? periodTotals[periodTotals.length - 1] : undefined;
  }, [periodTotals]);

  const bestCampaigns = useMemo(() => {
    return monthlySummary.slice(0, 5);
  }, [monthlySummary]);

  const worstCampaigns = useMemo(() => {
    return [...monthlySummary]
      .sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))
      .slice(0, 5);
  }, [monthlySummary]);

  const redFlagTop = useMemo(() => redFlags.slice(0, 5), [redFlags]);

  const chartData = useMemo(
    () =>
      filteredTotals.map((item) => ({
        period: item.period_month,
        revenue: item.revenue ?? 0,
        spend: item.spend ?? 0,
        roas: item.roas ?? 0,
      })),
    [filteredTotals]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Amazon広告ダッシュボード</h2>
          <p className="text-sm text-muted-foreground">
            月次KPI・トレンド・リスクサインを一元監視
          </p>
        </div>
        <div className="flex gap-2">
          {RANGE_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              variant={range === preset.value ? "default" : "outline"}
              onClick={() => setRange(preset.value)}
              size="sm"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>当月売上</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "-" : formatCurrency(latestTotal?.revenue ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            キャンペーン全体の税込売上
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>当月費用</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "-" : formatCurrency(latestTotal?.spend ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            広告費（円換算）
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ROAS</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading
                ? "-"
                : latestTotal?.roas
                ? latestTotal.roas.toFixed(2)
                : "0.00"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            売上 / 費用（直近月）
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">月次トレンド</CardTitle>
            <CardDescription>売上・費用・ROAS の推移</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="h-[360px]">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis
                  yAxisId="left"
                  stroke="#475569"
                  tickFormatter={(value) => `${numberFormatter.format(value / 1000)}k`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#16a34a"
                  tickFormatter={(value) => value.toFixed(1)}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "ROAS") {
                      return [value.toFixed(2), name];
                    }
                    return [formatCurrency(value), name];
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="売上" fill="#2563eb" />
                <Bar yAxisId="left" dataKey="spend" name="費用" fill="#f97316" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="roas"
                  name="ROAS"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              データがありません
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" /> ベストキャンペーン
            </CardTitle>
            <CardDescription>売上TOP5（当月）</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, idx) => (
                  <div key={idx} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>キャンペーン</TableHead>
                    <TableHead className="w-24 text-right">売上</TableHead>
                    <TableHead className="w-24 text-right">費用</TableHead>
                    <TableHead className="w-20 text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bestCampaigns.map((row, idx) => (
                    <TableRow key={`${row.campaign ?? ""}-${idx}`}>
                      <TableCell>
                        <div className="font-medium">{row.campaign ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.portfolio ?? "ポートフォリオ未設定"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.revenue ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.spend ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(row.roas ?? 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!bestCampaigns.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        データがありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" /> 要改善キャンペーン
            </CardTitle>
            <CardDescription>ROAS下位5件（当月）</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, idx) => (
                  <div key={idx} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>キャンペーン</TableHead>
                    <TableHead className="w-24 text-right">売上</TableHead>
                    <TableHead className="w-24 text-right">費用</TableHead>
                    <TableHead className="w-20 text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {worstCampaigns.map((row, idx) => (
                    <TableRow key={`${row.campaign ?? ""}-${idx}`}>
                      <TableCell>
                        <div className="font-medium">{row.campaign ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.portfolio ?? "ポートフォリオ未設定"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.revenue ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.spend ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(row.roas ?? 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!worstCampaigns.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        データがありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">赤旗アラート</CardTitle>
          <CardDescription>
            売上が大幅減（60%未満）かつ費用維持（80%以上）のキャンペーン
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, idx) => (
                <div key={idx} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>キャンペーン</TableHead>
                  <TableHead>比較期間</TableHead>
                  <TableHead className="w-24 text-right">売上</TableHead>
                  <TableHead className="w-24 text-right">費用</TableHead>
                  <TableHead className="w-40">チェックポイント</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redFlagTop.map((row, idx) => (
                  <TableRow key={`${row.campaign ?? ""}-${idx}`}>
                    <TableCell>
                      <div className="font-medium">{row.campaign ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.platform ?? "amazon"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.period_prev ?? "-"} → {row.period_curr ?? "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(row.revenue_prev ?? 0)} →<br />
                      {formatCurrency(row.revenue_curr ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(row.spend_prev ?? 0)} →<br />
                      {formatCurrency(row.spend_curr ?? 0)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      在庫 / 価格 / レビュー / 配置 / 検索語句
                    </TableCell>
                  </TableRow>
                ))}
                {!redFlagTop.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      赤旗候補はありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
