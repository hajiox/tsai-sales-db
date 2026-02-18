"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
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

    // ポップアップが開いたら検索をクリア
    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen)
        if (isOpen) {
            setSearch("")
        }
    }

    // 検索でフィルタリングした候補
    const filtered = React.useMemo(() => {
        if (!search) return candidates
        const q = search.toLowerCase()
        return candidates.filter(c => c.name.toLowerCase().includes(q))
    }, [candidates, search])

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
            <PopoverContent className="w-[300px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={placeholder}
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        {filtered.length === 0 && search ? (
                            <CommandEmpty className="py-2 px-2 text-sm text-gray-500">
                                候補なし。
                                <Button
                                    variant="ghost"
                                    className="w-full justify-start text-blue-600 h-8 mt-1"
                                    onClick={() => {
                                        onSelect(search)
                                        setOpen(false)
                                    }}
                                >
                                    &quot;{search}&quot; を使用
                                </Button>
                            </CommandEmpty>
                        ) : (
                            <CommandGroup>
                                {filtered.map((item, idx) => (
                                    <CommandItem
                                        key={(item.id || "idx-" + idx) + item.name}
                                        value={item.name}
                                        onSelect={() => {
                                            onSelect(item)
                                            setOpen(false)
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === item.name ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {item.name}
                                        <span className="ml-auto text-xs text-gray-400">
                                            {item.unit_price ? `¥${item.unit_price}` : ''}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
