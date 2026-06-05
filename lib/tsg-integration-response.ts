export async function parseTsgJsonResponse(response: Response) {
    const text = await response.text();
    if (!text) return {};

    const contentType = response.headers.get('content-type') || '';
    const trimmed = text.trim();
    const looksHtml = contentType.includes('text/html') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');

    if (!contentType.includes('application/json')) {
        throw new Error(
            looksHtml
                ? `TSG連携APIがJSONではなくHTMLを返しました（HTTP ${response.status}）。TSG本番のデプロイまたは連携URLを確認してください。`
                : `TSG連携APIがJSONではない応答を返しました（HTTP ${response.status}）。`
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`TSG連携APIのJSON解析に失敗しました（HTTP ${response.status}）。`);
    }
}
