import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const resultUrl = new URL("../evaluation/results/deepseek-v4-flash-phase-2a4.json", import.meta.url);
const reportUrl = new URL("../docs/phase-2a4-competition-semantic-repair.md", import.meta.url);

function readResult() {
  return JSON.parse(readFileSync(resultUrl, "utf8"));
}

test("sealed Phase 2A.4 result preserves the lightweight competition metrics", () => {
  const result = readResult();
  assert.deepEqual(result.executionPlan, {
    regressionCases: 24,
    blindHoldoutCases: 24,
    repeatedHighRiskCases: 6,
    repeatedRunsPerCase: 3,
    totalExecutions: 60,
  });
  assert.equal(result.safetyMetricsByDataset.regression.criticalSemanticMissCount, 0);
  assert.equal(result.safetyMetricsByDataset.regression.unsupportedAcceptCount, 0);
  assert.deepEqual(result.safetyMetricsByDataset.regression.redFlags, { safelyRouted: 23, total: 23 });
  assert.equal(result.safetyMetricsByDataset.blind_holdout.criticalSemanticMissCount, 2);
  assert.equal(result.safetyMetricsByDataset.blind_holdout.unsupportedAcceptCount, 0);
  assert.deepEqual(result.safetyMetricsByDataset.blind_holdout.redFlags, { safelyRouted: 30, total: 35 });

  const assertion = result.assertionMetricsByDataset.blind_holdout;
  assert.deepEqual(metric(assertion.evidenceSpanRecall), [37, 43]);
  assert.deepEqual(metric(assertion.subjectAccuracy), [34, 43]);
  assert.deepEqual(metric(assertion.certaintyAccuracy), [34, 43]);
  assert.deepEqual(metric(assertion.temporalityAccuracy), [37, 43]);
  assert.deepEqual(metric(assertion.clarificationTriggerRecall), [10, 13]);
  assert.equal(result.clinicalSemanticDrift.gate.casesWithDrift, 0);
  assert.equal(result.clinicalSemanticDrift.gate.totalCases, 6);
  assert.equal(result.regressionResults.passedCases, 24);
  assert.equal(result.blindHoldoutResults.passedCases, 21);
  assert.equal(result.verifierMetrics.supportedWithoutEvidenceAccepted, 0);
  assert.equal(result.providerFailureCount, 0);
  assert.equal(result.verifierFailureCount, 0);
  assert.equal(result.schemaInvalidCount, 5);
  assert.equal(result.criteria.clarificationStable, false);
  assert.equal(result.verdict, "NOT_READY");
});

test("Phase 2A.4 report documents the sealed result and does not overstate readiness", () => {
  const report = readFileSync(reportUrl, "utf8");
  for (const required of [
    "2f5aeb3fefb4a49e729a15a6099ff78ac3790e08",
    "b939e32",
    "0ae26aa5bf551384a54542b0b5ed9c2ef2f31d6966bbaed1c84a6d1bdc9a3f87",
    "Critical Semantic Miss",
    "Unsupported ACCEPT",
    "Clarification Trigger Recall",
    "Gate Drift",
    "NOT_READY",
    "不建议立即进入 Phase 2B",
  ]) assert.match(report, new RegExp(escapeRegExp(required)));
  assert.doesNotMatch(report, /COMPETITION_READY_FOR_PHASE_2B/);
});

test("sealed Phase 2A.4 result excludes raw patient text, prompts and credentials", () => {
  const result = readResult();
  const forbidden = new Set([
    "input", "patientUtterance", "evidenceText", "systemInstruction", "prompt",
    "reasoning", "apiKey", "authorization",
  ]);
  visit(result, (key) => assert.ok(!forbidden.has(key), `forbidden result key: ${key}`));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /DEEPSEEK_API_KEY|Bearer\s+[A-Za-z0-9._-]+/i);
  if (process.env.DEEPSEEK_API_KEY) assert.ok(!serialized.includes(process.env.DEEPSEEK_API_KEY));
});

function metric(value) {
  return [value.correct, value.total];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function visit(value, inspectKey) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, inspectKey);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    inspectKey(key);
    visit(child, inspectKey);
  }
}
