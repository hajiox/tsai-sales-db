export interface AiChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Character limits bound transport size; they are not estimates of billed tokens.
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARACTERS = 24_000;

export function prepareAiChatContext(input: unknown) {
  if (!Array.isArray(input) || input.length === 0 || input.some((message) =>
    !message || !['user', 'model'].includes(message.role) || typeof message.text !== 'string'
  )) throw new Error('メッセージの形式が正しくありません');
  const messages = input as AiChatMessage[];
  if (messages[messages.length - 1].role !== 'user') {
    throw new Error('最後のメッセージには質問を指定してください');
  }

  // Never truncate the current question or split older user/answer turns.
  // Keep a contiguous recent suffix so omitted context cannot appear continuous.
  let start = messages.length - 1;
  let historyCharacters = 0;
  while (start > 0) {
    let previousUser = start - 1;
    while (previousUser >= 0 && messages[previousUser].role !== 'user') previousUser -= 1;
    if (previousUser < 0) break;
    const turn = messages.slice(previousUser, start);
    const turnCharacters = turn.reduce((sum, message) => sum + message.text.length, 0);
    if (messages.length - previousUser - 1 > MAX_HISTORY_MESSAGES
      || historyCharacters + turnCharacters > MAX_HISTORY_CHARACTERS) break;
    start = previousUser;
    historyCharacters += turnCharacters;
  }
  const retained = messages.slice(start);
  return {
    messages: retained,
    omittedMessages: start,
    inputMessages: messages.length,
    retainedMessages: retained.length,
    retainedCharacters: retained.reduce((sum, message) => sum + message.text.length, 0),
    omissionInstruction: start > 0
      ? '\n古い会話の一部は送信上限のため省略されています。現在のデータと表示された会話だけを根拠にし、省略された過去の条件を推測しないでください。質問が省略部分を参照していて回答に必要なら、その条件をユーザーに確認してください。\n'
      : '',
  };
}

export function aiChatUsageRecord(
  route: 'web-sales-chat' | 'ads-chat',
  context: ReturnType<typeof prepareAiChatContext>,
  usage: unknown,
  model: string,
  durationMs: number,
) {
  const metadata = usage && typeof usage === 'object' ? usage as Record<string, unknown> : {};
  const count = (key: string) => typeof metadata[key] === 'number'
    && Number.isSafeInteger(metadata[key]) && (metadata[key] as number) >= 0 ? metadata[key] as number : null;
  // Strict allow-list: no source text, prompts, IDs, errors or provider response bodies.
  return {
    event: 'ai_chat_usage', version: 1, system: 'tsa', provider: 'gemini',
    task: route, model, status: 'success',
    durationMs: Math.max(0, Math.round(durationMs)),
    inputMessages: context.inputMessages,
    retainedMessages: context.retainedMessages,
    omittedMessages: context.omittedMessages,
    retainedCharacters: context.retainedCharacters,
    inputTokens: count('promptTokenCount'),
    cachedInputTokens: count('cachedContentTokenCount'),
    outputTokens: count('candidatesTokenCount'),
    thinkingTokens: count('thoughtsTokenCount'),
    totalTokens: count('totalTokenCount'),
  };
}

export function logAiChatUsage(record: ReturnType<typeof aiChatUsageRecord>) {
  try { console.info(record); } catch { /* Logging must not fail a completed answer. */ }
}
