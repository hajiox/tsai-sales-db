"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Loader2, Upload } from "lucide-react";
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

const BATCH_SIZE = 100;

type CsvRow = Record<string, string>;

type StagingRow = {
  campaign: string;
  portfolio?: string | null;
  country?: string | null;
  status?: string | null;
  spend_converted?: number | null;
  revenue_converted?: number | null;
  roas?: number | null;
  budget_converted?: number | null;
  period_month?: string;
  source_file?: string;
};

type ImportJob = {
  id: number;
  month?: string | null;
  period_month?: string | null;
  source_file?: string | null;
  rows?: number | null;
  row_count?: number | null;
  rows_processed?: number | null;
  status?: string | null;
  created_at?: string | null;
};

type ImportResult = {
  upserted_rows?: number | null;
  message?: string | null;
};

async function parseCsv(file: File): Promise<CsvRow[]> {
  return await new Promise((resolve, reject) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) {
          reject(new Error(results.errors[0].message));
          return;
        }
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

function sanitizeRow(row: CsvRow, periodMonth: string, sourceFile: string): StagingRow | null {
  const campaign = row.campaign?.trim();
  if (!campaign) {
    return null;
  }

  const parseNumber = (value?: string) => {
    if (!value) return null;
    const normalized = value.replace(/[,\s]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    campaign,
    portfolio: row.portfolio?.trim() || null,
    country: row.country?.trim() || null,
    status: row.status?.trim() || null,
    spend_converted: parseNumber(row.spend_converted ?? row.spend),
    revenue_converted: parseNumber(row.revenue_converted ?? row.revenue),
    roas: parseNumber(row.roas),
    budget_converted: parseNumber(row.budget_converted ?? row.budget),
    period_month: periodMonth,
    source_file: sourceFile,
  };
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP");
}

export default function AdsImportPage() {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();

  const [periodMonth, setPeriodMonth] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const fetchJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from("ads.import_job")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      toast({
        title: "取込履歴の取得に失敗しました",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setJobs(data ?? []);
  }, [supabase, toast]);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newFile = event.target.files?.[0] ?? null;
    setFile(newFile);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!periodMonth) {
      toast({
        title: "取込月を入力してください",
        variant: "destructive",
      });
      return;
    }
    if (!file) {
      toast({
        title: "CSVファイルを選択してください",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    setLastResult(null);

    try {
      const csvRows = await parseCsv(file);
      const preparedRows = csvRows
        .map((row) => sanitizeRow(row, periodMonth, file.name))
        .filter((row): row is StagingRow => !!row);

      if (!preparedRows.length) {
        toast({
          title: "有効な行が見つかりませんでした",
          description: "campaign列が空の行は除外されます",
          variant: "destructive",
        });
        return;
      }

      const batches = chunkRows(preparedRows, BATCH_SIZE);
      for (const batch of batches) {
        const { error } = await supabase
          .from("ads.stg_amazon_campaign_csv")
          .insert(batch);
        if (error) {
          throw error;
        }
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "ads.import_amazon_from_staging",
        {
          p_period_month: periodMonth,
          p_source_file: file.name,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      setLastResult(rpcData as ImportResult);
      toast({
        title: "インポート完了",
        description: `${preparedRows.length}件を取り込みました`,
      });
      setFile(null);
      (event.currentTarget as HTMLFormElement).reset();
      await fetchJobs();
    } catch (error) {
      console.error(error);
      toast({
        title: "インポートに失敗しました",
        description: error instanceof Error ? error.message : "不明なエラー",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const rowsProcessedText = useMemo(() => {
    if (!lastResult) return "-";
    const value =
      lastResult.upserted_rows ?? lastResult.message ?? JSON.stringify(lastResult);
    return typeof value === "number" ? `${value} rows` : String(value);
  }, [lastResult]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Amazon広告CSV取込</h2>
        <p className="text-sm text-muted-foreground">
          期間（月）とCSVを指定して Amazon 広告指標を取り込みます。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">CSVアップロード</CardTitle>
          <CardDescription>
            campaign / spend_converted / revenue_converted / roas を含むCSVを指定
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="period-month">対象月</Label>
              <Input
                id="period-month"
                type="month"
                required
                value={periodMonth}
                onChange={(event) => setPeriodMonth(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="csv-file">CSVファイル</Label>
              <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} />
              <p className="text-xs text-muted-foreground">
                1回のアップロードで最大{BATCH_SIZE}件ずつ分割して登録します。
              </p>
            </div>
            <Button type="submit" disabled={isImporting} className="w-full sm:w-auto">
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  取り込み中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  CSVを取り込む
                </>
              )}
            </Button>
          </form>
          {lastResult && (
            <div className="mt-6 rounded-md border bg-muted/40 p-4 text-sm">
              <div className="font-medium">最終インポート結果</div>
              <div className="text-muted-foreground">{rowsProcessedText}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">取込履歴</CardTitle>
          <CardDescription>直近10件のインポートジョブ</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>月</TableHead>
                <TableHead>ファイル</TableHead>
                <TableHead className="w-24 text-right">件数</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>実行日時</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>{job.month ?? job.period_month ?? "-"}</TableCell>
                  <TableCell className="font-medium">
                    {job.source_file ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {job.rows ?? job.row_count ?? job.rows_processed ?? "-"}
                  </TableCell>
                  <TableCell>{job.status ?? "-"}</TableCell>
                  <TableCell>{formatDateTime(job.created_at)}</TableCell>
                </TableRow>
              ))}
              {!jobs.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    取込履歴がありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
