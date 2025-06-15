// components/dashboard-header.tsx

"use client";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className="w-[240px] justify-start text-left font-normal bg-white"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(selectedDate, "PPP")}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && onDateChange(date)}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </header>
    );
}
