import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TASK_MODEL_POLICIES, taskModelPolicy, acceptsTaskModelParameters, applyTaskModelPolicy, BROWSER_COMPLETION_POLICY } from '../tools/tsa-codex-bridge/task-model-policy.mjs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const contract = JSON.parse(read('tools/tsa-codex-bridge/skill-contract.json'));
assert.deepEqual(Object.keys(TASK_MODEL_POLICIES).sort(), [...Object.keys(contract.tasks).filter(k => k !== 'connection_test'), 'carrier_monthly_import'].sort());
for (const [key, policy] of Object.entries(TASK_MODEL_POLICIES)) {
  const args = ['exec', '--ephemeral', '--model', 'gpt-6-astra', '-c', 'model_reasoning_effort="medium"', '--config', 'model="gpt-6-astra"', '--sandbox', 'read-only', '--output-schema', 'result.json', '-'];
  const routed = applyTaskModelPolicy(key, args);
  assert.equal(routed.filter(a => a === '--model').length, 1, key);
  assert.equal(routed[routed.indexOf('--model') + 1], policy.model, key);
  assert.deepEqual(routed.filter(a => String(a).startsWith('model_reasoning_effort=')), [`model_reasoning_effort="${policy.reasoningEffort}"`]);
  assert.equal(routed.at(-1), '-');
  assert.ok(routed.includes('--ephemeral') && routed.includes('read-only') && routed.includes('result.json'));
  assert.equal(args[3], 'gpt-6-astra', 'input argv must not be mutated');
  assert.deepEqual(applyTaskModelPolicy(key, routed), routed, 'routing must be idempotent');
  assert.ok(acceptsTaskModelParameters(key, policy));
  assert.ok(acceptsTaskModelParameters(key, { model: 'gpt-6-astra', reasoningEffort: 'medium' }));
  assert.equal(acceptsTaskModelParameters(key, { model: 'arbitrary-model', reasoningEffort: 'high' }), false);
  assert.equal(acceptsTaskModelParameters(key, { model: policy.model, reasoningEffort: 'ultra' }), false);
  if (policy.browser) {
    const skill = key === 'carrier_monthly_import' ? 'tsa-carrier-shipment-csv' : contract.tasks[key].skill;
    assert.match(read(`tools/tsa-codex-bridge/skills/${skill}/SKILL.md`), /## 作業完了後のタブ整理/);
  }
}
assert.throws(() => taskModelPolicy('unknown'), /Unknown/);
for (const key of ['web_sales_analysis', 'recipe_reviews_analyze']) assert.equal(taskModelPolicy(key).model, 'gpt-6-astra');
assert.equal(taskModelPolicy('recipe_reviews_collect').model, 'gpt-6-luna');
for (const file of ['ec-product-name-codex.ts','ec-catchcopy-codex.ts','ec-product-content-codex.ts','ingredient-label-codex.ts','recipe-sns.ts','docscanner-fax-summary.ts']) {
  assert.match(read(`lib/${file}`), /MODEL = "gpt-6-sol"/);
}
assert.match(read('lib/recipe-sns-publish.ts'), /MODEL = "gpt-6-luna"/);
assert.match(read('lib/recipe-sns-publish.ts'), /REASONING_EFFORT = "high"/);
assert.match(BROWSER_COMPLETION_POLICY, /before returning the final result JSON/);
assert.match(BROWSER_COMPLETION_POLICY, /Never infer ownership/);
assert.match(BROWSER_COMPLETION_POLICY, /Re-list tabs once/);
const bridge = read('tools/tsa-codex-bridge/bridge.mjs');
assert.match(bridge, /spawnCodexProcess\(applyTaskModelPolicy\(taskKey, args\), spawnOptions\)/);
assert.match(bridge, /taskModelPolicy\(taskKey\)\.browser \? BROWSER_COMPLETION_POLICY/);
assert.match(read('tools/tsa-codex-bridge/install-bridge.ps1'), /"task-model-policy.mjs"\) -Destination/);
console.log(`Verified ${Object.keys(TASK_MODEL_POLICIES).length} task model policies, legacy inputs, CLI overrides and browser completion contract.`);
