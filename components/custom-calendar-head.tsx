import * as React from 'react';
import { HeadProps } from 'react-day-picker';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

// 曜日を定義
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

export function CustomCalendarHead(props: HeadProps) {
  return (
    <thead className="text-muted-foreground">
      <tr className="flex">
        {weekdays.map((day) => (
          <th
            key={day}
            scope="col"
            // ★ 各曜日が均等に配置されるようにスタイルを直接指定
            className="flex h-9 w-9 items-center justify-center p-0 text-xs font-normal"
          >
            {day}
          </th>
        ))}
      </tr>
    </thead>
  );
}
