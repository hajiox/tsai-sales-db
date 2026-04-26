"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LpTrackingTarget } from "../types";

export default function LpTrackingListPage() {
  const router = useRouter();
  const [targets, setTargets] = useState<LpTrackingTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTargets();
  }, []);

  const fetchTargets = async () => {
    try {
      const res = await fetch("/api/lp-tracking");
      if (!res.ok) throw new Error("Failed to fetch");
      const { data } = await res.json();
      setTargets(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "公開済":
      case "実装済": return "bg-green-600";
      case "テスト済": return "bg-blue-600";
      case "テスト中": return "bg-yellow-600";
      case "実装中": return "bg-orange-600";
      case "要修正": return "bg-red-600";
      case "停止中": return "bg-gray-600";
      default: return "bg-slate-500";
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">LP計測・実装指示管理</h1>
        <Button onClick={() => router.push("/lp-tracking/new")} className="bg-blue-600 hover:bg-blue-700">
          + 新規追加
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LP計測対象一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>読み込み中...</p>
          ) : targets.length === 0 ? (
            <p className="text-slate-500">登録されたLPがありません。</p>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>管理名</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>product値</TableHead>
                    <TableHead>購入先数</TableHead>
                    <TableHead>実装状況</TableHead>
                    <TableHead>テスト状況</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targets.map((t) => (
                    <TableRow key={t.id} className={!t.is_active ? "opacity-50 bg-slate-50" : ""}>
                      <TableCell className="font-medium">{t.management_name}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={t.lp_url}>
                        <a href={t.lp_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {t.lp_url}
                        </a>
                      </TableCell>
                      <TableCell>{t.product_value || "-"}</TableCell>
                      <TableCell>{t.links?.length || 0}</TableCell>
                      <TableCell>
                        <Badge className={`${getStatusColor(t.status)} text-white border-none`}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.test_status}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => router.push(`/lp-tracking/${t.id}`)}>
                          詳細・編集
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
