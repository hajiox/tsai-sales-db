type Version = { id: string; analysis_type: string };

// The API returns history newest first. Preserve a deliberate history selection
// until a new report for the displayed period arrives.
export function selectAnalysisVersion(
  analyses: Version[], periodType: string | undefined,
  previousLatestId: string, selectedId: string,
) {
  const latestId = analyses.find(item => item.analysis_type === periodType)?.id || analyses[0]?.id || "";
  return {
    latestId,
    selectedId: latestId === previousLatestId && analyses.some(item => item.id === selectedId)
      ? selectedId : latestId,
  };
}
