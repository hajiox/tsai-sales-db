const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REQUEST_BYTES = 32 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_MESSAGES = {
  UNAUTHORIZED: '接続トークンが無効・期限切れ・失効済みです。管理者に接続を確認してください。',
  FORBIDDEN: 'この接続には操作権限がありません。管理者に対象の権限を確認してください。',
  CONFLICT: '他の更新と競合しました。再取得して差分を確認してください。',
  VERSION_CONFLICT: '他の更新と競合しました。再取得して差分を確認してください。',
  APPROVAL_REQUIRED: '管理者による変更内容の確認が必要です。承認後に同じ変更IDを適用してください。',
  IDEMPOTENCY_CONFLICT: '同じ実行キーが異なる変更に使われています。重複登録せず、準備済みの変更を確認してください。',
  EXPIRED: '変更案の有効期限が切れています。現在のデータを取得し直して変更内容を確認してください。',
  REJECTED: '変更案は管理者に却下されています。別キーでの再申請による迂回は行わないでください。',
  NOT_FOUND: '対象が見つかりません。対象IDを確認してください。',
  RATE_LIMITED: '実行頻度の上限です。自動で連続再試行せず、時間を置いてください。',
};

export class DataApiError extends Error {
  constructor(code, message, requestId) {
    super(message);
    this.name = 'DataApiError';
    this.code = code;
    this.requestId = requestId;
  }
}

export function loadConfiguration(env = process.env) {
  let base;
  try { base = new URL(env.TSA_DATA_API_URL ?? ''); } catch {
    throw new DataApiError('CONFIGURATION', 'TSA_DATA_API_URL に TSA の HTTPS URL を設定してください。');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  const localDevelopment = env.TSA_DATA_ALLOW_LOCALHOST === '1' && loopback && base.protocol === 'http:';
  if ((base.protocol !== 'https:' && !localDevelopment) || base.username || base.password || base.search || base.hash ||
      !['/', '/api/data-access/v1', '/api/data-access/v1/'].includes(base.pathname)) {
    throw new DataApiError('CONFIGURATION', 'API URL は HTTPS の TSA オリジン、または /api/data-access/v1 に限定されます。');
  }
  const token = env.TSA_DATA_API_TOKEN ?? '';
  if (!/^tsa_data_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new DataApiError('CONFIGURATION', 'TSA_DATA_API_TOKEN に発行された専用接続トークンを設定してください。');
  }
  return { origin: base.origin, token };
}

export function createApiClient(configuration, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const { origin, token } = configuration;
  async function post(path, body) {
    if (!['/read', '/changes'].includes(path) && !/^\/changes\/[0-9a-f-]{36}\/apply$/i.test(path)) {
      throw new DataApiError('INVALID_OPERATION', '対応していない操作です。');
    }
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_REQUEST_BYTES) {
      throw new DataApiError('REQUEST_TOO_LARGE', '入力が大きすぎます。変更を分割してください。');
    }
    let response;
    let payload;
    try {
      response = await fetchImpl(`${origin}/api/data-access/v1${path}`, {
        method: 'POST', redirect: 'manual', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: serialized, signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new DataApiError('REDIRECT_BLOCKED', 'API の転送先には接続しません。管理者に接続先 URL を確認してください。');
      }
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        await response.body?.cancel();
        throw new DataApiError('INVALID_RESPONSE', 'API が JSON を返していません。ログイン画面等への転送を管理者に確認してください。');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new DataApiError('INVALID_RESPONSE', 'API 応答が空です。');
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new DataApiError('RESPONSE_TOO_LARGE', '結果が大きすぎます。取得件数や期間を絞ってください。');
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof DataApiError) throw error;
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new DataApiError('TIMEOUT', 'API 応答が時間内にありません。更新は結果を確認してから再実行してください。');
      }
      throw new DataApiError('CONNECTION_FAILED', 'API に接続できないか応答が不正です。接続先と稼働状態を確認してください。');
    }
    const requestId = typeof payload?.requestId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(payload.requestId)
      ? payload.requestId : undefined;
    if (!response.ok || payload?.ok !== true) {
      const code = typeof payload?.error?.code === 'string' && /^[A-Z_]{1,64}$/.test(payload.error.code)
        ? payload.error.code : `HTTP_${response.status}`;
      throw new DataApiError(code, ERROR_MESSAGES[code] ?? 'API が操作を受け付けませんでした。権限・入力・変更状態を確認してください。', requestId);
    }
    // The server projects business fields. Never echo the connection token even if a faulty upstream returns it.
    return JSON.parse(JSON.stringify(payload).replaceAll(token, '[redacted]'));
  }
  return {
    read: body => post('/read', body),
    prepare: body => post('/changes', body),
    apply: id => {
      if (!UUID.test(id)) throw new DataApiError('INVALID_INPUT', '変更 ID は UUID で指定してください。');
      return post(`/changes/${id}/apply`, {});
    },
  };
}
