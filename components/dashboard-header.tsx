"use client";
// import { Calendar as CalendarIcon } from "lucide-react"; // <- コメントアウト
import { format } from "date-fns";
// import { Button } from "@/components/ui/button"; // <- コメントアウト
// import { Calendar } from "@/components/ui/calendar"; // <- コメントアウト
// import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // <- コメントアウト

interface Props {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

export default function DashboardHeader({ selectedDate, onDateChange }: Props) {
    return (
        <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800">
                統合売上ダッシュボード
            </h1>
            {/* Popover機能を一時的に無効化。代わりに日付をテキスト表示 */}
            <div className="text-lg font-semibold text-slate-700">
                {format(selectedDate, "yyyy.MM.dd")}
            </div>
        </header>
    );
}
