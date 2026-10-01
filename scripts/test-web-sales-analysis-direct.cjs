const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'Node' });
require('ts-node/register/transpile-only');
const {
  analysisPacketHash, assertDirectPacket, assertDirectQuality, DirectAnalysisConflict,
  directAnalysisSaveSchema, loadDirectCostWarnings, saveDirectAnalysis,
  withDirectCostWarnings,
} = require('../lib/web-sales-analysis/direct.ts');

const packet = {
  packet_version: 2,
  generated_at: '2026-10-01T00:00:00.000Z',
  report_month: '2026-09',
  period: { start_date: '2026-09-01', end_date: '2026-09-30', type: 'monthly' },
  analysis_scope: { period_type: 'monthly' },
  headline: { target: { sales: 10000, final_profit: 1200 } },
  data_quality: { channels: [{ channel: 'amazon', settlement_coverage: 'complete', settlement_estimated: false }] },
};
const data = {
  status: 'completed', executive_summary: '根拠に基づく総評', sales_analysis: '売上',
  expense_analysis: '経費', floor_staff_summary: '9月の販売状況',
  actions: [1, 2, 3].map(priority => ({
    priority, area: 'sales', title: `施策${priority}`, rationale: '数量を改善する',
    evidence: ['9月売上10000円'], expected_impact: '増加', deadline: '10月末',
    metric: '販売数量', stop_condition: '減少したら停止', confidence: 'medium',
  })), risks: [],
  data_quality: { grade: 'A', summary: '確認済み', limitations: [] },
};
const input = {
  month: '2026-09', requestId: '4f253b7c-f4b6-4ae2-9647-0bde62db6650',
  packet, packetHash: analysisPacketHash(packet), model: 'gpt-6-astra', data,
};
assert.equal(directAnalysisSaveSchema.safeParse(input).success, true);

assert.equal(analysisPacketHash({ ...packet, generated_at: '2026-10-01T00:01:00.000Z' }), input.packetHash);
assertDirectPacket(input, { ...packet, generated_at: '2026-10-01T00:01:00.000Z' });
assert.throws(() => assertDirectPacket(input, {
  ...packet, headline: { target: { sales: 11000, final_profit: 1200 } },
}), DirectAnalysisConflict);
assert.throws(() => assertDirectPacket({ ...input, month: '2026-08' }, packet), DirectAnalysisConflict);

const unknownCost = [{ productId: 'product-1', name: '原価未確認商品', savedCost: null, reason: '月次保存原価が空欄または0以下' }];
const warnedPacket = withDirectCostWarnings(packet, unknownCost);
assert.deepEqual(warnedPacket.data_quality.direct_cost_warnings, unknownCost);
assert.notEqual(analysisPacketHash(warnedPacket), input.packetHash);
assert.throws(() => assertDirectQuality(input, packet, unknownCost), DirectAnalysisConflict);
const reviewData = { ...data, status: 'needs_review', data_quality: { ...data.data_quality, limitations: ['原価が未確認'] } };
assertDirectQuality({ ...input, data: reviewData }, packet, unknownCost);
assert.throws(() => assertDirectQuality(input, {
  ...packet, data_quality: { channels: [{ channel: 'base', settlement_coverage: 'partial', settlement_estimated: false }] },
}, []), DirectAnalysisConflict);

async function main() {
  const warnings = await loadDirectCostWarnings({
    query: async () => ({ rows: [{ product_id: 'product-1', name: '原価未確認商品', unit_cost_ex_ec: null, unit_price: 1000 }] }),
  }, '2026-09');
  assert.deepEqual(warnings, unknownCost);
  const derivedWarnings = await loadDirectCostWarnings({
    query: async () => ({ rows: [{ product_id: 'product-2', name: '利益率未確認商品', unit_cost_ex_ec: 1000, unit_price: 1000 }] }),
  }, '2026-09');
  assert.match(derivedWarnings[0].reason, /保存利益率0%/);
  assert.throws(() => assertDirectQuality({ ...input, data: reviewData }, packet, derivedWarnings), DirectAnalysisConflict);
  const derivedReview = { ...reviewData, data_quality: {
    ...reviewData.data_quality, limitations: ['利益率0%により販売単価を原価として計上した商品がある'],
  } };
  assertDirectQuality({ ...input, data: derivedReview }, packet, derivedWarnings);

  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes('SELECT job.id')) return { rows: [] };
      if (sql.includes('SELECT id FROM web_sales_codex_jobs')) return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT COALESCE(MAX(version)')) return { rows: [{ version: 2 }] };
      if (sql.includes('INSERT INTO web_sales_codex_jobs')) return { rows: [{ id: 'job-1' }] };
      if (sql.includes('INSERT INTO web_sales_ai_analyses')) return { rows: [{ id: 'analysis-1' }] };
      return { rows: [] };
    },
  };
  const saved = await saveDirectAnalysis(client, input, 'admin@example.com');
  assert.deepEqual(saved, {
    status: 'completed', analysisId: 'analysis-1', jobId: 'job-1',
    version: 3, tsgPostStatus: 'skipped', duplicate: false,
  });
  assert.equal(calls[0], 'BEGIN');
  assert.equal(calls.at(-1), 'COMMIT');
  assert.ok(calls.some(sql => sql.includes('INSERT INTO web_sales_codex_job_events')));

  const duplicateCalls = [];
  const duplicateClient = {
    query: async (sql) => {
      duplicateCalls.push(sql);
      if (sql.includes('SELECT job.id')) return {
        rows: [{ id: 'job-1', parameters: { inputHash: input.packetHash,
          resultHash: analysisPacketHash({ data, model: input.model }) },
        analysis_id: 'analysis-1', version: 3, status: 'completed' }],
      };
      return { rows: [] };
    },
  };
  const duplicate = await saveDirectAnalysis(duplicateClient, input, 'admin@example.com');
  assert.equal(duplicate.duplicate, true);
  assert.ok(!duplicateCalls.some(sql => sql.includes('INSERT INTO')));

  const failingClient = {
    query: async (sql) => {
      if (sql.includes('SELECT job.id')) return { rows: [] };
      if (sql.includes('SELECT id FROM web_sales_codex_jobs')) return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT COALESCE(MAX(version)')) return { rows: [{ version: 0 }] };
      if (sql.includes('INSERT INTO web_sales_codex_jobs')) return { rows: [{ id: 'job-2' }] };
      if (sql.includes('INSERT INTO web_sales_ai_analyses')) throw new Error('insert failed');
      calls.push(sql);
      return { rows: [] };
    },
  };
  await assert.rejects(saveDirectAnalysis(failingClient, input, 'admin@example.com'), /insert failed/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  console.log('Direct WEB sales analysis packet and transactional save checks passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
