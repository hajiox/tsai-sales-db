"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { generateSuggestion } from "@/lib/ai/provider";

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type SliceSummaryRow = {
  month_date?: string;
  period_month?: string;
  campaign?: string;
  portfolio?: string | null;
  spend?: number | null;
  revenue?: number | null;
  roas?: number | null;
};

type RollupRow = {
  window?: string | null;
  period_month?: string | null;
  spend?: number | null;
  revenue?: number | null;
  roas?: number | null;
};

type SuggestionRecord = {
  id: number;
  month: string;
  platform_id: number;
  summary_md: string;
  json_detail: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
};

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const roasFormatter = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "-";

export default function AdsSuggestionsPage() {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();

  const today = useMemo(() => new Date(), []);
  const defaultTo = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today]
  );
  const defaultFrom = useMemo(() => {
    const base = new Date(defaultTo);
    base.setMonth(base.getMonth() - 2);
    return base;
  }, [defaultTo]);

  const [from, setFrom] = useState(formatDateInput(defaultFrom));
  const [to, setTo] = useState(formatDateInput(defaultTo));
  const [platformId, setPlatformId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryRows, setSummaryRows] = useState<SliceSummaryRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRecord[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);

  const fetchPlatformId = useCallback(async () => {
    const { data, error } = await supabase
      .from("ads.platform")
      .select("id, code")
      .eq("code", "amazon")
      .maybeSingle();

    if (error) {
      toast({
        title: "プラットフォームIDの取得に失敗しました",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    if (data?.id) {
      setPlatformId(data.id);
    }
  }, [supabase, toast]);

  const fetchSuggestions = useCallback(async () => {
    setIsLoadingSuggestions(true);
    const { data, error } = await supabase
      .from("ads.ai_suggestion")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      toast({
        title: "提案の取得に失敗しました",
        description: error.message,
        variant: "destructive",
      });
      setIsLoadingSuggestions(false);
      return;
    }

    setSuggestions(data as SuggestionRecord[]);
    setIsLoadingSuggestions(false);
  }, [supabase, toast]);

  useEffect(() => {
    void fetchPlatformId();
    void fetchSuggestions();
  }, [fetchPlatformId, fetchSuggestions]);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!platformId) {
      toast({
        title: "プラットフォームが未設定です",
        description: "ads.platform に amazon が存在するか確認してください",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data: sliceData, error: sliceError } = await supabase.rpc(
        "ads.slice_summary",
        {
          p_from: from,
          p_to: to,
          p_platform: "amazon",
        }
      );

      if (sliceError) {
        throw sliceError;
      }

      setSummaryRows((sliceData as SliceSummaryRow[]) ?? []);

      const [roll1, roll3, roll6, roll12, redFlagsRes] = await Promise.all([
        supabase.from("ads.v_rollup_1m").select("*").maybeSingle(),
        supabase.from("ads.v_rollup_3m").select("*").maybeSingle(),
        supabase.from("ads.v_rollup_6m").select("*").maybeSingle(),
        supabase.from("ads.v_rollup_12m").select("*").maybeSingle(),
        supabase
          .from("ads.v_red_flags")
          .select("*")
          .eq("platform", "amazon")
          .limit(10),
      ]);

      if (roll1.error || roll3.error || roll6.error || roll12.error || redFlagsRes.error) {
        throw roll1.error || roll3.error || roll6.error || roll12.error || redFlagsRes.error;
      }

      const detail = {
        range: { from, to },
        summary: sliceData ?? [],
        rollups: {
          oneMonth: roll1.data ?? null,
          threeMonth: roll3.data ?? null,
          sixMonth: roll6.data ?? null,
          twelveMonth: roll12.data ?? null,
        },
        redFlags: redFlagsRes.data ?? [],
      };

      const aiResult = await generateSuggestion(detail);

      const latestMonth = (() => {
        const months = (sliceData as SliceSummaryRow[] | null)?.
          map((row) => row.period_month)
          .filter((value): value is string => !!value);
        if (months && months.length) {
          return months.sort().slice(-1)[0];
        }
        if (Array.isArray(detail.rollups.oneMonth) && detail.rollups.oneMonth?.[0]) {
          const value = detail.rollups.oneMonth[0] as RollupRow;
          return value.period_month ?? null;
        }
        if (detail.rollups.oneMonth && !(Array.isArray(detail.rollups.oneMonth))) {
          return (detail.rollups.oneMonth as RollupRow).period_month ?? null;
        }
        return to.slice(0, 7);
      })();

      const { error: insertError } = await supabase.from("ads.ai_suggestion").insert({
        month: latestMonth ?? to.slice(0, 7),
        platform_id: platformId,
        summary_md: aiResult.markdown,
        json_detail: aiResult.detail ?? detail,
      });

      if (insertError) {
        throw insertError;
      }

      toast({
        title: "AI提案を保存しました",
        description: `${to} 時点の提案を追加しました`,
      });
      await fetchSuggestions();
    } catch (error) {
      console.error(error);
      toast({
        title: "提案生成に失敗しました",
        description: error instanceof Error ? error.message : "不明なエラー",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (markdown: string) => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast({ title: "コピーしました" });
    } catch (error) {
      console.error(error);
      toast({
        title: "コピーに失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number) => {
    const { error } = await supabase.from("ads.ai_suggestion").delete().eq("id", id);
    if (error) {
      toast({
        title: "削除に失敗しました",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "削除しました" });
    await fetchSuggestions();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">AI提案</h2>
        <p className="text-sm text-muted-foreground">
          期間を指定して集計を生成し、AIによる改善提案を保存します。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">提案を生成</CardTitle>
          <CardDescription>直近3ヶ月を推奨（Amazonのみ対応）</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleGenerate}>
            <div className="grid gap-2">
              <Label htmlFor="from">開始日</Label>
              <Input
                id="from"
                type="date"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="to">終了日</Label>
              <Input
                id="to"
                type="date"
                required
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button type="submit" disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AI提案を生成
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFrom(formatDateInput(defaultFrom));
                  setTo(formatDateInput(defaultTo));
                }}
              >
                <RefreshCw className="h-4 w-4" />
                デフォルト期間に戻す
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {summaryRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">集計サマリー</CardTitle>
            <CardDescription>{from}〜{to} のキャンペーン別実績</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>月</TableHead>
                    <TableHead>キャンペーン</TableHead>
                    <TableHead>ポートフォリオ</TableHead>
                    <TableHead className="w-28 text-right">売上</TableHead>
                    <TableHead className="w-28 text-right">費用</TableHead>
                    <TableHead className="w-20 text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryRows.map((row, idx) => (
                    <TableRow key={`${row.campaign ?? ""}-${idx}`}>
                      <TableCell>{row.period_month ?? "-"}</TableCell>
                      <TableCell className="font-medium">{row.campaign ?? "-"}</TableCell>
                      <TableCell>{row.portfolio ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {currencyFormatter.format(row.revenue ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {currencyFormatter.format(row.spend ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">{roasFormatter(row.roas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">保存済み提案</CardTitle>
          <CardDescription>最新20件のMarkdownを表示</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSuggestions ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中...
            </div>
          ) : suggestions.length ? (
            <div className="space-y-4">
              {suggestions.map((item) => (
                <Card key={item.id} className="border-muted">
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">{item.month} / #{item.id}</CardTitle>
                      <CardDescription>
                        {new Date(item.created_at).toLocaleString("ja-JP")} 生成
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(item.summary_md)}
                      >
                        コピー
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        削除
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="prose max-w-none prose-sm">
                      <ReactMarkdown>{item.summary_md}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">保存済みの提案がありません。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
