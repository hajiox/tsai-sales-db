"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

import { NutritionData } from "./NutritionDisplay";

export interface ItemCandidate {
    id?: string
    name: string
    unit_quantity?: number | string
    unit_price?: number
    unit_weight?: number
    tax_included?: boolean
    cost?: number | string // for intermediate
    nutrition?: NutritionData;
}

interface ItemNameSelectProps {
    candidates: ItemCandidate[]
    value: string
    onSelect: (item: ItemCandidate | string) => void
    placeholder?: string
}

export default function ItemNameSelect({
    candidates,
    value,
    onSelect,
    placeholder = "入力または選択...",
}: ItemNameSelectProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const inputRef = React.useRef<HTMLInputElement>(null)

    // ポップアップが開いたら検索をクリアしてフォーカス
    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen)
        if (isOpen) {
            setSearch("")
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }

    // 検索でフィルタリングした候補
    const filtered = React.useMemo(() => {
        if (!search) return candidates
        const q = search.toLowerCase()
        return candidates.filter(c => c.name.toLowerCase().includes(q))
    }, [candidates, search])

    const handleSelect = (item: ItemCandidate) => {
        onSelect(item)
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-8 px-2 text-sm font-normal text-left"
                >
                    <span className="truncate">{value || placeholder}</span>
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
                {/* 検索入力 */}
                <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={placeholder}
                        className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-gray-400"
                    />
                </div>
                {/* 候補リスト */}
                <div className="max-h-[300px] overflow-y-auto p-1">
                    {filtered.length === 0 ? (
                        <div className="py-3 px-2 text-sm text-gray-500">
                            候補なし。
                            {search && (
                                <button
                                    type="button"
                                    className="w-full text-left text-blue-600 hover:bg-blue-50 rounded px-2 py-1.5 mt-1 text-sm"
                                    onClick={() => {
                                        onSelect(search)
                                        setOpen(false)
                                    }}
                                >
                                    &quot;{search}&quot; を使用
                                </button>
                            )}
                        </div>
                    ) : (
                        filtered.map((item, idx) => (
                            <button
                                key={(item.id || "idx-" + idx) + item.name}
                                type="button"
                                onClick={() => handleSelect(item)}
                                className={cn(
                                    "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                                    "hover:bg-gray-100 active:bg-gray-200 transition-colors",
                                    value === item.name && "bg-gray-50"
                                )}
                            >
                                <Check
                                    className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        value === item.name ? "opacity-100 text-blue-600" : "opacity-0"
                                    )}
                                />
                                <span className="truncate">{item.name}</span>
                                <span className="ml-auto text-xs text-gray-400 shrink-0 pl-2">
                                    {item.unit_price ? `¥${item.unit_price}` : ''}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
