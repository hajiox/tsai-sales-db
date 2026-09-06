import assert from 'node:assert/strict';
import { prepareAiChatContext, aiChatUsageRecord, logAiChatUsage } from '../lib/ai-chat-context.ts';

const question = { role: 'user', text: '今月の利益は？' };
const answer = { role: 'model', text: '利益は100円です。' };
const short = [question, answer, question];
assert.deepEqual(prepareAiChatContext(short).messages, short);
assert.equal(prepareAiChatContext(short).omissionInstruction, '');
assert.deepEqual(short, [question, answer, question]);

const long = Array.from({ length: 30 }, (_, index) => ({
  role: index % 2 ? 'model' : 'user', text: String(index),
}));
const bounded = prepareAiChatContext([...long, question]);
assert.equal(bounded.retainedMessages, 13);
assert.equal(bounded.omittedMessages, 18);
assert.deepEqual(bounded.messages, [...long.slice(18), question]);
assert.match(bounded.omissionInstruction, /推測しない/);

// An oversized previous turn is omitted intact; the newest question is never cut.
const hugeQuestion = { role: 'user', text: '条件'.repeat(30_000) };
assert.deepEqual(prepareAiChatContext([question, { role: 'model', text: 'a'.repeat(24_001) }, hugeQuestion]).messages, [hugeQuestion]);
assert.equal(prepareAiChatContext([hugeQuestion]).retainedCharacters, 60_000);
assert.deepEqual(prepareAiChatContext([
  question, { role: 'model', text: 'a'.repeat(24_001) }, question, answer, question,
]).messages, [question, answer, question]);
assert.equal(prepareAiChatContext([{ role: 'model', text: 'welcome' }, question]).messages[0], question);
for (const invalid of [null, [], {}, [{ role: 'user', text: null }], [answer], [{ role: 'system', text: 'x' }]]) {
  assert.throws(() => prepareAiChatContext(invalid));
}

const usage = aiChatUsageRecord('ads-chat', bounded, {
  promptTokenCount: 100, cachedContentTokenCount: 50, candidatesTokenCount: 20,
  thoughtsTokenCount: 10, totalTokenCount: 130, secret: 'DO_NOT_LOG', prompt: question.text,
}, 'gemini-2.5-flash', 120);
assert.equal(usage.inputTokens, 100);
assert.equal(usage.cachedInputTokens, 50);
assert.equal(usage.thinkingTokens, 10);
assert.equal(usage.totalTokens, 130);
assert.ok(!JSON.stringify(usage).includes('DO_NOT_LOG'));
assert.ok(!JSON.stringify(usage).includes(question.text));
assert.equal(aiChatUsageRecord('ads-chat', bounded, null, 'gemini-2.5-flash', 0).inputTokens, null);
assert.equal(aiChatUsageRecord('ads-chat', bounded, { promptTokenCount: '100', totalTokenCount: -1 }, 'gemini-2.5-flash', 0).totalTokens, null);
console.log('AI chat context: complete-turn bounds, latest input, validation and private usage passed.');

assert.equal(usage.version, 1);
assert.equal(usage.system, 'tsa');
assert.equal(usage.durationMs, 120);
const originalInfo = console.info;
try {
  console.info = () => { throw new Error('logger down'); };
  assert.doesNotThrow(() => logAiChatUsage(usage));
} finally { console.info = originalInfo; }
