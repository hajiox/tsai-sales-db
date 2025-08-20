// sales-report-form.tsx (統合ダッシュボード対応版)

"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, ClipboardCheck, Loader2 } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
const supabase = getSupabaseBrowserClient();
import { formatDateJST, formatCurrency } from "@/lib/utils"

// --- 変更点1: PropsにonSaveSuccessを追加 ---
type SalesReportFormProps = {
  initialDate?: string; // yyyy-MM-dd形式
  onSaveSuccess?: () => void; // 保存成功時に呼び出すコールバック関数
};

const salesChannels = [
  { key: "amazon", name: "Amazon" },
  { key: "rakuten", name: "楽天" },
  { key: "yahoo", name: "Yahoo!" },
  { key: "mercari", name: "メルカリ" },
  { key: "base", name: "BASE" },
  { key: "qoo10", name: "Qoo10" },
];

type FormData = {
  floor_sales: string;
  cash_income: string;
  register_count: string;
  remarks: string;
  [key: string]: string;
};

// --- 変更点2: コンポーネントがonSaveSuccessを受け取るように変更 ---
export default function SalesReportForm({ initialDate, onSaveSuccess }: SalesReportFormProps) {
  const getInitialDate = () => {
    if (initialDate) {
      return new Date(initialDate + 'T00:00:00');
    }
    return new Date();
  };

  const [date, setDate] = useState<Date | undefined>(getInitialDate());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true); 
  const [isDataFound, setIsDataFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<string>("");
  const [isCopied, setIsCopied] = useState(false);

  const emptyFormData: FormData = {
    floor_sales: "", cash_income: "", register_count: "", remarks: "",
    ...salesChannels.reduce((acc, channel) => {
      acc[`${channel.key}_count`] = "";
      acc[`${channel.key}_amount`] = "";
      return acc;
    }, {} as { [key: string]: string }),
  };
  const [formData, setFormData] = useState<FormData>(emptyFormData);

  const fetchAndSetData = useCallback(async (targetDate: Date) => {
    setIsLoading(true);
    setError(null);
    setGeneratedReport("");

    const dateString = formatDateJST(targetDate);
    
    try {
      const { data, error } = await supabase
        .from('daily_sales_report')
        .select('*')
        .eq('date', dateString)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const newFormData: FormData = {
            floor_sales: String(data.floor_sales ?? ''),
            cash_income: String(data.cash_income ?? ''),
            register_count: String(data.register_count ?? ''),
            remarks: data.remarks ?? '',
            ...salesChannels.reduce((acc, channel) => {
                acc[`${channel.key}_count`] = String(data[`${channel.key}_count`] ?? '');
                acc[`${channel.key}_amount`] = String(data[`${channel.key}_amount`] ?? '');
                return acc;
            }, {} as {[key: string]: string}),
        };
        setFormData(newFormData);
        setIsDataFound(true);
      } else {
        setFormData(emptyFormData);
        setIsDataFound(false);
      }
    } catch(e: any) {
        console.error("データ読込エラー:", e);
        setError("データの読み込みに失敗しました。");
        setFormData(emptyFormData);
        setIsDataFound(false);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date) {
      fetchAndSetData(date);
    }
  }, [date, fetchAndSetData]);

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const generateReportText = (data: any): string => {
    if (!data) return ""
    const webSalesText = salesChannels.map(channel => `${channel.name} 売上 / ${data[`d_${channel.key}_count`] || 0}件 ${formatCurrency(data[`d_${channel.key}_amount`] || 0)}`).join("\n");
    const webCumulativeText = salesChannels.map(channel => `${channel.name}累計 / ${formatCurrency(data[`m_${channel.key}_total`] || 0)}`).join("\n");
    return `【会津ブランド館売上報告】
${formatDateJST(date || new Date())}
フロア日計 / ${formatCurrency(data.d_floor_sales || 0)}
フロア累計 / ${formatCurrency(data.m_floor_total || 0)}
入　金 / ${formatCurrency(data.d_cash_income || 0)}
レジ通過人数 / ${data.d_register_count || 0} 人
【WEB売上】
${webSalesText}
${webCumulativeText}
WEB売上累計 / ${formatCurrency(data.m_web_total || 0)}
【月内フロア＋WEB累計売上】
${formatCurrency(data.m_grand_total || 0)}`;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date) {
      setError("日付を選択してください。");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setGeneratedReport("");
    setIsCopied(false);

    const submissionData = {
      date: formatDateJST(date),
      ...Object.entries(formData).reduce((acc, [key, value]) => {
        if (key !== 'remarks') {
          acc[key as keyof Omit<FormData, 'remarks'>] = value === '' ? null : Number(value);
        } else {
          acc[key] = value;
        }
        return acc;
      }, {} as any),
    };

    try {
      const { error: upsertError } = await supabase
        .from("daily_sales_report")
        .upsert(submissionData, { onConflict: 'date' });
      if (upsertError) throw upsertError;

      const { data: reportData, error: rpcError } = await supabase.rpc(
        "get_sales_report_data", { report_date: formatDateJST(date) }
      );
      if (rpcError) throw rpcError;
      if (!reportData || reportData.length === 0) throw new Error("レポートデータの取得に失敗しました。");
      
      const reportText = generateReportText(reportData[0]);
      setGeneratedReport(reportText);
      setIsDataFound(true); // 登録・更新後はデータが存在する状態になる

      // --- 変更点3: 保存成功を親に通知 ---
      if (onSaveSuccess) {
        onSaveSuccess();
      }

    } catch (e: any) {
      console.error("エラーが発生しました:", e);
      setError(`エラー: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (!generatedReport) return;
    navigator.clipboard.writeText(generatedReport);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  // Cardで囲むのをやめて、より部品として使いやすくする
  return (
    <div className="w-full space-y-4">
      <Card>
          <CardHeader>
            <CardTitle>{isDataFound ? '売上修正' : '売上入力'}</CardTitle>
            <CardDescription>
              {isDataFound 
                ? '既存の売上データを修正します。' 
                : '日次の売上データを入力してください。'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                    <p>データを読み込んでいます...</p>
                </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label className="font-medium">報告日</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? formatDateJST(date) : <span>日付を選択</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1"><Label htmlFor="floor_sales" className="text-xs font-medium">フロア日計売上</Label><Input id="floor_sales" type="number" value={formData.floor_sales} onChange={(e) => handleInputChange("floor_sales", e.target.value)} placeholder="0" /></div>
                <div className="space-y-1"><Label htmlFor="cash_income" className="text-xs font-medium">入金額</Label><Input id="cash_income" type="number" value={formData.cash_income} onChange={(e) => handleInputChange("cash_income", e.target.value)} placeholder="0" /></div>
                <div className="space-y-1"><Label htmlFor="register_count" className="text-xs font-medium">レジ通過人数</Label><Input id="register_count" type="number" value={formData.register_count} onChange={(e) => handleInputChange("register_count", e.target.value)} placeholder="0" /></div>
              </div>

              <div>
                <Label className="text-sm font-medium">Web売上</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2">
                  {salesChannels.map((channel) => (
                    <div key={channel.key} className="p-3 border rounded-md space-y-2">
                      <Label className="text-xs font-semibold">{channel.name}</Label>
                      <div className="space-y-1"><Label className="text-xs text-gray-500">販売件数</Label><Input type="number" value={formData[`${channel.key}_count`]} onChange={(e) => handleInputChange(`${channel.key}_count`, e.target.value)} className="text-xs h-7" placeholder="0" /></div>
                      <div className="space-y-1"><Label className="text-xs text-gray-500">売上金額</Label><Input type="number" value={formData[`${channel.key}_amount`]} onChange={(e) => handleInputChange(`${channel.key}_amount`, e.target.value)} className="text-xs h-7" placeholder="0" /></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1"><Label className="text-xs font-medium">備考</Label><Textarea value={formData.remarks} onChange={(e) => handleInputChange("remarks", e.target.value)} className="text-xs min-h-[60px]" placeholder="特記事項があれば入力してください" /></div>
              
              <Button type="submit" disabled={isSubmitting || isLoading} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "処理中..." : (isDataFound ? "更新してレポート生成" : "登録してレポート生成")}
              </Button>
              
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
            )}
          </CardContent>
        </Card>
        
        {generatedReport && (
          <Card className="mt-4"><CardHeader><CardTitle>生成された売上報告</CardTitle></CardHeader><CardContent>
              <div className="relative">
                <Textarea readOnly value={generatedReport} className="text-sm font-mono min-h-[420px] bg-gray-50" />
                <Button size="sm" variant="ghost" onClick={handleCopyToClipboard} className="absolute top-2 right-2">{isCopied ? <ClipboardCheck className="h-4 w-4 text-green-500" /> : "コピー"}</Button>
              </div>
          </CardContent></Card>
        )}
    </div>
  );
}
