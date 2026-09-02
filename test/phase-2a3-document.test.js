import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const resultUrl = new URL("../evaluation/results/deepseek-v4-flash-phase-2a3.json", import.meta.url);
const reportUrl = new URL("../docs/phase-2a3-evidence-grounded-validation.md", import.meta.url);

function readResult() {
  return JSON.parse(readFileSync(resultUrl, "utf8"));
}

test("sealed Phase 2A.3 result preserves the measured safety and assertion metrics", () => {
  const result = readResult();

  assert.deepEqual(result.caseCounts, {
    baselineGold: 24,
    legacySentinels: 8,
    phase2a1Sentinels: 8,
    developmentVariants: 60,
    retainedHoldout: 40,
    blindHoldout: 40,
    total: 180,
    executions: 540,
  });
  assert.equal(result.runs, 3);
  assert.equal(result.safetyMetrics.criticalSemanticMissCount, 102);
  assert.equal(result.safetyMetrics.unsupportedAcceptCount, 42);
  assert.equal(result.safetyMetrics.redFlags.safelyRouted, 264);
  assert.equal(result.safetyMetrics.redFlags.total, 360);
  assert.equal(result.safetyMetrics.uncertainties.safelyRouted, 42);
  assert.equal(result.safetyMetrics.uncertainties.total, 51);
  assert.equal(result.safetyMetrics.hallucinations.rejected, 272);
  assert.equal(result.safetyMetrics.hallucinations.total, 344);
  assert.equal(result.retainedHoldoutResults.passedCases, 18);
  assert.equal(result.holdoutResults.passedCases, 24);
  assert.equal(result.holdoutResults.cases, 40);

  const assertion = result.assertionMetricsByDataset.blind_holdout;
  assert.deepEqual(metric(assertion.evidenceSpanRecall), [87, 171]);
  assert.deepEqual(metric(assertion.subjectAccuracy), [84, 171]);
  assert.deepEqual(metric(assertion.negationAccuracy), [87, 171]);
  assert.deepEqual(metric(assertion.certaintyAccuracy), [81, 171]);
  assert.deepEqual(metric(assertion.temporalityAccuracy), [69, 171]);
  assert.deepEqual(metric(assertion.conceptMappingAccuracy), [66, 141]);
  assert.deepEqual(metric(assertion.clarificationTriggerRecall), [21, 24]);

  assert.equal(result.verifierMetrics.correct, 361);
  assert.equal(result.verifierMetrics.total, 536);
  assert.equal(result.verifierMetrics.supportedWithoutEvidenceAccepted, 0);
  assert.equal(result.clinicalSemanticDrift.extractor.casesWithDrift, 21);
  assert.equal(result.clinicalSemanticDrift.gate.casesWithDrift, 3);
  assert.equal(result.providerFailureCount, 0);
  assert.equal(result.verifierFailureCount, 0);
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.phase2B, "NOT_READY");
});

test("Phase 2A.3 report documents the frozen run and conservative verdict", () => {
  const report = readFileSync(reportUrl, "utf8");

  for (const required of [
    "768073578cc999dd61449c864444121831d58049",
    "63070fb",
    "a65552cfc79c817ca8a6005cbbed3e7dba927f89be0d502ab2c627b75c74b4dd",
    "Evidence Span Recall",
    "Critical Semantic Miss",
    "Unsupported ACCEPT",
    "Clinical Semantic Drift",
    "Verifier Accuracy",
    "FAIL",
    "NOT_READY FOR PHASE 2B",
  ]) {
    assert.match(report, new RegExp(escapeRegExp(required)));
  }
});

test("sealed Phase 2A.3 result excludes raw text, prompts, reasoning and credentials", () => {
  const result = readResult();
  const forbiddenKeys = new Set([
    "input",
    "patientUtterance",
    "evidenceText",
    "systemInstruction",
    "prompt",
    "reasoning",
    "apiKey",
    "authorization",
  ]);

  visit(result, (key) => assert.ok(!forbiddenKeys.has(key), `forbidden result key: ${key}`));

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /DEEPSEEK_API_KEY|Bearer\s+[A-Za-z0-9._-]+/i);
  if (process.env.DEEPSEEK_API_KEY) {
    assert.ok(!serialized.includes(process.env.DEEPSEEK_API_KEY));
  }
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
