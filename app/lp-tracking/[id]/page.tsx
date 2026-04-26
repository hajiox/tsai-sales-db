"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LpTrackingTarget, LpTrackingLink, LP_STATUS_OPTIONS, DESTINATION_OPTIONS } from "../types";
import { ArrowLeft, Plus, Trash2, Copy, Check, ExternalLink, Crosshair } from "lucide-react";

export default function LpTrackingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const isNew = id === "new";

  const [target, setTarget] = useState<Partial<LpTrackingTarget>>({
    management_name: "",
    lp_url: "",
    product_value: "",
    meta_pixel_id: "",
    status: "未実装",
    test_status: "テスト未",
    memo: "",
    is_active: true,
  });
  const [links, setLinks] = useState<Partial<LpTrackingLink>[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isNew) fetchTarget();
  }, [id, isNew]);

  const fetchTarget = async () => {
    try {
      const res = await fetch(`/api/lp-tracking/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const { data } = await res.json();
      setTarget(data);
      setLinks(data.links || []);
    } catch (err) {
      console.error(err);
      alert("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!target.management_name || !target.lp_url) {
      alert("管理名とLP URLは必須です");
      return;
    }
    setSaving(true);
    try {
      const url = isNew ? "/api/lp-tracking" : `/api/lp-tracking/${id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, links })
      });
      if (!res.ok) throw new Error("Failed to save");
      if (isNew) {
        const { data } = await res.json();
        router.push(`/lp-tracking/${data.id}`);
      } else {
        await fetchTarget();
      }
    } catch (err) {
      console.error(err);
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("このLP計測対象を削除しますか？関連する購入先リンクもすべて削除されます。")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/lp-tracking/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/web-sales/advertising");
    } catch (err) {
      console.error(err);
      alert("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  const addLink = () => {
    setLinks([...links, {
      destination_name: "rakuten",
      destination_value: "",
      url: "",
      is_active: true,
      is_tracking_target: true,
      is_tested: false,
      memo: ""
    }]);
  };

  const updateLink = (index: number, field: string, value: any) => {
    const newLinks = [...links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setLinks(newLinks);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const generateInstructions = () => {
    const linkInstructions = links
      .filter(l => l.is_tracking_target && l.is_active)
      .map(l => `
購入先：
${l.destination_name}

URL：
${l.url || '未設定'}

このURLへ移動するリンクをクリックした時に、以下のMetaイベントを発火してください。

fbq('trackCustom', 'MallClick', {
  product: '${target.product_value || ''}',
  destination: '${l.destination_value || l.destination_name}',
  url: '${l.url || ''}'
});`).join("\n");

    return `対象ページ：
${target.lp_url}

このページにMetaピクセルと購入先クリック計測を追加してください。

やることは以下です。

1. 指定Metaピクセルを埋め込む

MetaピクセルID：
${target.meta_pixel_id || '未設定'}

ページ表示時に PageView が発火するようにしてください。
すでに同じMetaピクセルが入っている場合は、二重設置しないでください。

2. ViewContentを発火する

ページ表示時に以下のイベントを発火してください。

fbq('track', 'ViewContent', {
  content_name: '${target.management_name}',
  content_category: 'product_lp'
});

3. 購入先クリックでMallClickを発火する

以下の購入先リンクをクリックした時に、それぞれMetaイベントを発火してください。
${linkInstructions}

注意点：
・ページのデザインや文言は変更しないでください。
・リンク先URLも変更しないでください。
・Googleタグマネージャーは使わず、ページ内に直接実装してください。
・外部リンクへ移動する前にイベントが送信されるようにしてください。
・可能ならクリック後300ms待ってから遷移してください。
・PageView、ViewContent、MallClickが二重発火しないようにしてください。
`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateInstructions());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="p-8 text-gray-500">読み込み中...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-0">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/web-sales/advertising")} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <Crosshair className="text-teal-600" size={24} />
          <h1 className="text-xl font-bold">{isNew ? "新規LP登録" : target.management_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 size={15} />{deleting ? "削除中..." : "削除"}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:bg-gray-400"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* 統合フォーム */}
      <div className="bg-white border rounded-xl divide-y">
        {/* 基本情報 */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">管理名 <span className="text-red-500">*</span></label>
              <Input value={target.management_name || ""} onChange={e => setTarget({...target, management_name: e.target.value})} placeholder="例: ラーメンLP 2026年版" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">LP URL <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <Input className="flex-1" value={target.lp_url || ""} onChange={e => setTarget({...target, lp_url: e.target.value})} placeholder="https://..." />
                {target.lp_url && (
                  <a href={target.lp_url} target="_blank" rel="noopener noreferrer" className="p-2 border rounded-lg hover:bg-gray-50 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0">
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">product値 (イベントパラメータ)</label>
              <Input value={target.product_value || ""} onChange={e => setTarget({...target, product_value: e.target.value})} placeholder="例: ramen_800g" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">MetaピクセルID</label>
              <Input value={target.meta_pixel_id || ""} onChange={e => setTarget({...target, meta_pixel_id: e.target.value})} placeholder="123456789012345" className="font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">実装状況</label>
              <Select value={target.status} onValueChange={v => setTarget({...target, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LP_STATUS_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">テスト状況</label>
              <Input value={target.test_status || ""} onChange={e => setTarget({...target, test_status: e.target.value})} placeholder="例: 未テスト" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">備考</label>
              <Input value={target.memo || ""} onChange={e => setTarget({...target, memo: e.target.value})} placeholder="メモ" />
            </div>
          </div>
        </div>

        {/* 購入先リンク */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">購入先リンク</h3>
            <button onClick={addLink} className="flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors">
              <Plus size={14} />追加
            </button>
          </div>
          {links.length === 0 && <p className="text-xs text-gray-400 py-2">購入先リンクが未登録です。「追加」ボタンで登録してください。</p>}
          {links.map((link, index) => (
            <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="grid grid-cols-3 gap-3 flex-1">
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-500">購入先名</label>
                  <Select value={link.destination_name} onValueChange={v => updateLink(index, "destination_name", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DESTINATION_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-500">destination値</label>
                  <Input className="h-8 text-sm" value={link.destination_value || ""} onChange={e => updateLink(index, "destination_value", e.target.value)} placeholder="rakuten_shop" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-500">URL</label>
                  <Input className="h-8 text-sm" value={link.url || ""} onChange={e => updateLink(index, "url", e.target.value)} placeholder="https://..." />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-5 flex-shrink-0">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={link.is_tracking_target} onChange={e => updateLink(index, "is_tracking_target", e.target.checked)} className="rounded border-gray-300" />
                  計測
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={link.is_tested} onChange={e => updateLink(index, "is_tested", e.target.checked)} className="rounded border-gray-300" />
                  テスト済
                </label>
                <button onClick={() => removeLink(index)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* v0実装指示文 */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">v0実装指示文 (自動生成)</h3>
            <button onClick={handleCopy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {copied ? <><Check size={13} />コピー済!</> : <><Copy size={13} />コピー</>}
            </button>
          </div>
          <pre className="text-[11px] font-mono bg-slate-900 text-green-400 p-4 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap leading-relaxed">
            {generateInstructions()}
          </pre>
        </div>
      </div>
    </div>
  );
}
