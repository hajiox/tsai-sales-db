
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Link as LinkIcon, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Types
type MasterType = 'ingredient' | 'material' | 'recipe' | 'product';

interface MasterItem {
    id: string;
    name: string;
    type: MasterType;
    price?: number;
}

interface UnlinkedGroup {
    name: string;
    count: number;
    dominantType: string;
}

export default function IntegrationPage() {
    const [unlinkedGroups, setUnlinkedGroups] = useState<UnlinkedGroup[]>([]);
    const [masters, setMasters] = useState<MasterItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Unlinked Items
            const res = await fetch('/api/recipe/integration');
            const unlinked: UnlinkedGroup[] = await res.json();

            // Filter: Only show items that look like intermediates or products
            // User requested "Only 【P】 or 【Product】 basically"
            // We'll keep items where dominantType is 'intermediate' OR name implies product/intermediate
            const targetItems = unlinked.filter(g => {
                const n = g.name;
                const t = g.dominantType;
                // If explicitly typed as intermediate/product (rarely happens with unlinked string data unless we guess it)
                if (t === 'intermediate' || t === 'product') return true;

                // Name check
                if (n.includes('【P】') || n.includes('【商品】') || n.includes('スープ') || n.includes('たれ')) return true;
                // Exclude obvious ingredients if they don't match above
                if (t === 'ingredient' || t === 'material') return false;

                // Default: Include if we aren't sure, but user said "Ingredients mixed is hard to see", so maybe be strict.
                return false;
            });

            setUnlinkedGroups(targetItems);

            // 2. Fetch Masters
            // We need to ensure we have data. Use anon client (imported supabase) which should work given RLS check passed.
            const [ingRes, matRes, recRes] = await Promise.all([
                supabase.from('ingredients').select('id, name, price_excl_tax'),
                supabase.from('materials').select('id, name, price_excl_tax'),
                supabase.from('recipes').select('id, name, is_intermediate, total_cost')
            ]);

            const masterList: MasterItem[] = [];
            // Prioritize Recipes (Intermediates/Products) at the top of the list if user cares about them most
            if (recRes.data) masterList.push(...recRes.data.map(r => ({ id: r.id, name: r.name, type: (r.is_intermediate ? 'recipe' : 'product') as MasterType, price: r.total_cost || 0 })));
            if (ingRes.data) masterList.push(...ingRes.data.map(i => ({ id: i.id, name: i.name, type: 'ingredient' as MasterType, price: i.price_excl_tax })));
            if (matRes.data) masterList.push(...matRes.data.map(m => ({ id: m.id, name: m.name, type: 'material' as MasterType, price: m.price_excl_tax })));

            setMasters(masterList);
        } catch (error) {
            console.error(error);
            toast.error("データの取得に失敗しました");
        } finally {
            setLoading(false);
        }
    };

    const handleLink = async (targetName: string, master: MasterItem) => {
        try {
            const res = await fetch('/api/recipe/integration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetName,
                    masterId: master.id,
                    masterType: master.type,
                    masterName: master.name
                })
            });

            if (!res.ok) throw new Error('Failed');

            toast.success(`「${targetName}」を「${master.name}」に統合しました`);

            // Remove from list locally
            setUnlinkedGroups(prev => prev.filter(g => g.name !== targetName));

        } catch (error) {
            toast.error("統合に失敗しました");
        }
    };

    // Filter Logic
    const filteredGroups = unlinkedGroups.filter(g =>
        g.name.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <LinkIcon className="w-8 h-8 text-blue-600" />
                    データ統合・クレンジング
                </h1>
                <p className="text-gray-600 mt-2">
                    Excelから取り込まれた「文字列データのアイテム」を、システム上の「正しいマスタ」に紐付けます。<br />
                    ここで紐付けを行うと、原価計算や利用状況の追跡が正確になります。
                </p>
            </div>

            <div className="flex gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder="未紐付けアイテムを検索..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>残り: <strong>{filteredGroups.length}</strong> 件</span>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>未紐付けアイテム一覧</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>現在の名称（Excel取込）</TableHead>
                                <TableHead>推定タイプ</TableHead>
                                <TableHead className="w-[100px] text-center">使用数</TableHead>
                                <TableHead>紐付け先マスタ（選択してください）</TableHead>
                                <TableHead className="w-[100px]">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8">読み込み中...</TableCell>
                                </TableRow>
                            ) : filteredGroups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-green-600 font-medium">
                                        <Check className="w-6 h-6 inline-block mr-2" />
                                        全てのデータが統合されています！
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredGroups.map((group) => (
                                    <UnlinkedRow
                                        key={group.name}
                                        group={group}
                                        masters={masters}
                                        onLink={handleLink}
                                    />
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function UnlinkedRow({ group, masters, onLink }: { group: UnlinkedGroup, masters: MasterItem[], onLink: (name: string, m: MasterItem) => void }) {
    const [selectedMaster, setSelectedMaster] = useState<MasterItem | null>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    // Performance optimization: Filter manually and limit results
    const filteredMasters = search
        ? masters.filter(m => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 50)
        : masters.slice(0, 20); // Show top 20 by default of unfiltered? Or just empty? 

    const handleSelect = (master: MasterItem) => {
        setSelectedMaster(master);
        setOpen(false);
    };

    const handleLink = () => {
        if (selectedMaster) {
            onLink(group.name, selectedMaster);
        }
    };

    return (
        <TableRow>
            <TableCell className="font-medium text-gray-900">
                {group.name}
            </TableCell>
            <TableCell>
                <span className={cn(
                    "px-2 py-0.5 rounded-full text-xs border bg-gray-50 text-gray-500 border-gray-200"
                )}>
                    {group.dominantType === 'ingredient' ? '食材' :
                        group.dominantType === 'material' ? '資材' :
                            group.dominantType === 'intermediate' ? '中間部品' : group.dominantType}
                </span>
            </TableCell>
            <TableCell className="text-center">
                {group.count}
            </TableCell>
            <TableCell>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="w-full justify-between font-normal text-left"
                        >
                            <span className="truncate">
                                {selectedMaster ? (
                                    <span className="flex items-center gap-2">
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap",
                                            selectedMaster.type === 'ingredient' ? 'bg-green-100 text-green-800' :
                                                selectedMaster.type === 'material' ? 'bg-orange-100 text-orange-800' :
                                                    'bg-purple-100 text-purple-800'
                                        )}>
                                            {selectedMaster.type === 'ingredient' ? '食' : selectedMaster.type === 'material' ? '資' : 'P'}
                                        </span>
                                        {selectedMaster.name}
                                    </span>
                                ) : "マスタを選択..."}
                            </span>
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                        <Command shouldFilter={false}>
                            <CommandInput placeholder="マスタを検索..." value={search} onValueChange={setSearch} />
                            <CommandList>
                                <CommandEmpty>見つかりません</CommandEmpty>
                                <CommandGroup heading="候補">
                                    {filteredMasters.map((master) => (
                                        <CommandItem
                                            key={master.id}
                                            value={master.name}
                                            onSelect={() => handleSelect(master)}
                                        >
                                            <div className="flex items-center gap-2 w-full">
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap",
                                                    master.type === 'ingredient' ? 'bg-green-100 text-green-800' :
                                                        master.type === 'material' ? 'bg-orange-100 text-orange-800' :
                                                            'bg-purple-100 text-purple-800'
                                                )}>
                                                    {master.type === 'ingredient' ? '食' : master.type === 'material' ? '資' : 'P'}
                                                </span>
                                                <span className="flex-1 truncate">{master.name}</span>
                                                {master.price && <span className="text-xs text-gray-400">¥{master.price}</span>}
                                            </div>
                                            <Check
                                                className={cn(
                                                    "ml-auto h-4 w-4",
                                                    selectedMaster?.id === master.id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </TableCell>
            <TableCell>
                <Button
                    size="sm"
                    disabled={!selectedMaster}
                    onClick={handleLink}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                    統合
                    <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
            </TableCell>
        </TableRow>
    );
}
