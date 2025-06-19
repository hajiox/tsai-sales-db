// /components/SeriesManager.tsx ver.1
"use client";

type SeriesMaster = {
  series_id: number;
  series_name: string;
};

interface SeriesManagerProps {
  seriesList: SeriesMaster[];
  showSeriesForm: boolean;
  newSeriesName: string;
  seriesLoading: boolean;
  onShowFormToggle: () => void;
  onNewSeriesNameChange: (name: string) => void;
  onAddSeries: () => void;
  onDeleteSeries: (id: number, name: string) => void;
}

export default function SeriesManager({
  seriesList,
  showSeriesForm,
  newSeriesName,
  seriesLoading,
  onShowFormToggle,
  onNewSeriesNameChange,
  onAddSeries,
  onDeleteSeries,
}: SeriesManagerProps) {
  return (
    <div className="bg-blue-50 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-base font-semibold">📚 シリーズ管理</h4>
        <button
          onClick={onShowFormToggle}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          {showSeriesForm ? 'キャンセル' : 'シリーズ追加'}
        </button>
      </div>
      {showSeriesForm && (
        <div className="mb-3 p-3 bg-white rounded border">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newSeriesName}
              onChange={(e) => onNewSeriesNameChange(e.target.value)}
              placeholder="新しいシリーズ名を入力"
              className="flex-1 px-2 py-1 border rounded text-sm"
              disabled={seriesLoading}
            />
            <button
              onClick={onAddSeries}
              disabled={seriesLoading || !newSeriesName.trim()}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
            >
              {seriesLoading ? '追加中...' : '追加'}
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {seriesList.map((series) => (
          <div key={series.series_id} className="flex justify-between items-center bg-white p-2 rounded border">
            <span>{series.series_id}: {series.series_name}</span>
            <button
              onClick={() => onDeleteSeries(series.series_id, series.series_name)}
              className="ml-2 px-1 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600"
              title="シリーズを削除"
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
