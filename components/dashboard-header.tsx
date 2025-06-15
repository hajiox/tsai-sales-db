"use client";
import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, DayOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

// ★ 曜日を日本語で正しく表示するためのフォーマット関数を定義
const formatWeekdayName = (day: Date, options: { locale?: any }) => {
    return format(day, 'E', { locale: options.locale });
};


export default function DashboardHeader({ selectedDate, onDateChange }: Props) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            onDateChange(date);
            setIsOpen(false); 
        }
    }

    return (
        <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800">
                統合売上ダッシュボード
            </h1>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className="w-[240px] justify-start text-left font-normal bg-white"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(selectedDate, "yyyy.MM.dd")}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
                        locale={ja}
                        formatters={{ formatWeekdayName }} // ★ formattersプロパティを追加
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </header>
    );
}
