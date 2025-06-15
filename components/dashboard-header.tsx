// ... (import文など)
import { format } from "date-fns";
// ...

export default function DashboardHeader({ selectedDate, onDateChange }: Props) {
    return (
        <header className="flex items-center justify-between">
            {/* ... */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className="w-[240px] justify-start text-left font-normal bg-white"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {/* ★日付フォーマットを "PPP" から "yyyy.MM.dd" に変更 */}
                        {format(selectedDate, "yyyy.MM.dd")}
                    </Button>
                </PopoverTrigger>
                {/* ... */}
            </Popover>
        </header>
    );
}
