// /components/RakutenCsvImportModal.tsx ver.7 - 日付選択機能追加版

// 1. stateに売上月を追加（13行目あたり、他のstateと一緒に）
const [saleMonth, setSaleMonth] = useState<string>(() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
});

// 2. ステップ2の確認画面に日付選択を追加（165行目あたり、ステップ2の冒頭に）
{step === 2 && parseResult && (
  <>
    {/* 売上月選択を追加 */}
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2">売上月:</label>
      <input
        type="month"
        value={saleMonth}
        onChange={(e) => setSaleMonth(e.target.value)}
        className="border rounded-md p-2"
      />
    </div>

    <Card>
      {/* 既存のCardコンテンツ... */}

// 3. 確定処理で動的な日付を使用（198行目を修正）
const requestData = {
  saleDate: `${saleMonth}-01`,  // 固定値ではなく選択された月を使用
  matchedProducts: convertedMatchedProducts,
  newMappings: convertedNewMappings
};
