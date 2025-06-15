"use client";
import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Calendar from 'react-calendar';
import './react-calendar.css';

// react-calendarからの戻り値の型定義
type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

interface Props {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

export default function DashboardHeader({ selectedDate, onDateChange }: Props) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleDateSelect = (value: Value, event: React.MouseEvent<HTMLButtonElement>) => {
        if (value instanceof Date) {
            onDateChange(value);
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
                      onChange={handleDateSelect}
                      value={selectedDate}
                      locale="ja-JP"
                      // ★ formatDayプロパティを追加して日付のフォーマットを数字のみに変更
                      formatDay={(locale, date) => format(date, 'd')}
                    />
                </PopoverContent>
            </Popover>
        </header>
    );
}
