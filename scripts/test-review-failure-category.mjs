import assert from 'node:assert/strict';
import {codexFailureCategory} from '../tools/tsa-codex-bridge/codex-event-log.mjs';
assert.equal(codexFailureCategory({type:'item.completed',message:'rate limit'}),null);
for(const [message,expected] of [['usage limit reached secret','usage_limit'],['401 unauthorized','authentication'],['approval denied','permission'],['invalid schema','invalid_request'],['stream disconnected','connection'],['private text','unclassified_codex_error']])assert.equal(codexFailureCategory({type:'turn.failed',error:{message}}),expected);
assert.equal(codexFailureCategory({type:'error',message:'429'}),'usage_limit');
assert.equal(codexFailureCategory(null),null);
console.log('PASS fixed failure categories without raw messages');
