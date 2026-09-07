import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectAnalysisVersion } from "../lib/web-sales-analysis/selection.ts";

const old = { id: "monthly-1", analysis_type: "monthly" };
const next = { id: "monthly-2", analysis_type: "monthly" };
const interim = { id: "interim-1", analysis_type: "half_month" };
assert.equal(selectAnalysisVersion([old], "monthly", "", "").selectedId, old.id);
assert.equal(selectAnalysisVersion([next, old], "monthly", old.id, old.id).selectedId, next.id,
  "A newly saved version must replace the version visible during analysis");
assert.equal(selectAnalysisVersion([next, old], "monthly", next.id, old.id).selectedId, old.id,
  "An unchanged poll must preserve a deliberate selection from history");
assert.equal(selectAnalysisVersion([interim, next, old], "monthly", old.id, old.id).selectedId, next.id);
assert.equal(selectAnalysisVersion([interim, next], "half_month", next.id, next.id).selectedId, interim.id);
assert.equal(selectAnalysisVersion([next], "monthly", next.id, "removed").selectedId, next.id);
assert.equal(selectAnalysisVersion([], "monthly", old.id, old.id).selectedId, "");
assert.equal(selectAnalysisVersion([next], undefined, "", "").selectedId, next.id);
const component = readFileSync("components/web-sales-codex-analysis.tsx", "utf8");
assert.match(component, /analyzing \? 3500 : 15000/);
assert.match(component, /visibilitychange/);
assert.match(component, /sequence !== requestSequence.current/);
assert.match(component, /activeMonth.current !== month/);
assert.match(component, /（最新版）/);
console.log("Analysis versions: completion switch, manual history, period changes, missing versions, idle refresh and stale-response guards passed");
