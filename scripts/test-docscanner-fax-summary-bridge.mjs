import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOCSCANNER_FAX_SUMMARY_MODEL,
  DOCSCANNER_FAX_SUMMARY_REASONING_EFFORT,
  DOCSCANNER_FAX_SUMMARY_RULES_VERSION,
  docScannerFaxSummaryNeedsReview,
  formatDocScannerFaxSummaryForTsg,
  validateDocScannerFaxSummaryResult,
} from '../lib/docscanner-fax-summary.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const bridge = read('tools', 'tsa-codex-bridge', 'bridge.mjs')
const contract = JSON.parse(read('tools', 'tsa-codex-bridge', 'skill-contract.json'))
const enqueueRoute = read('app', 'api', 'integrations', 'doc-scanner', 'fax-summary', 'route.ts')
const importRoute = read('app', 'api', 'web-sales', 'codex-bridge', 'jobs', '[id]', 'fax-summary-import', 'route.ts')

assert.equal(DOCSCANNER_FAX_SUMMARY_MODEL, 'gpt-5.6-luna')
assert.equal(DOCSCANNER_FAX_SUMMARY_REASONING_EFFORT, 'low')
assert.equal(DOCSCANNER_FAX_SUMMARY_RULES_VERSION, '2026-08-27.1')
assert.equal(contract.tasks.docscanner_fax_summary.skill, 'summarize-docscanner-fax')
assert.match(bridge, /minimalContext: true/)
assert.match(bridge, /ephemeral: true/)
assert.match(bridge, /sandbox: "read-only"/)
assert.match(bridge, /system: "docscanner", systemLabel: "DocScanner"/)
assert.match(bridge, /docScannerFaxSummaryRoot/)
assert.match(enqueueRoute, /faxSummaryIdempotencyKey/)
assert.match(enqueueRoute, /local_images_then_fresh_ephemeral_codex_skill/)
assert.match(importRoute, /updateTsgDocScannerFaxSummary/)
assert.doesNotMatch(enqueueRoute + importRoute, /chatHistory|threadId|conversationId|previousResponseId/)

const result = validateDocScannerFaxSummaryResult({
  document_type: '発注書',
  summary: '商品2点、合計5個の発注です。',
  key_points: ['納品希望日は2026年8月30日です。'],
  action_required: true,
  action_items: ['在庫と納期を確認する。'],
  needs_manual_review: false,
  unreadable_details: '',
  confidence: 'high',
})
const formatted = formatDocScannerFaxSummaryForTsg(result)
assert.match(formatted, /書類種別: 発注書/)
assert.match(formatted, /対応: 必要/)
assert.equal(docScannerFaxSummaryNeedsReview(result), false)
assert.equal(docScannerFaxSummaryNeedsReview({ ...result, confidence: 'low' }), true)
assert.throws(() => validateDocScannerFaxSummaryResult({ ...result, action_required: 'yes' }))

console.log('DocScanner FAX summary Bridge contract verified.')
