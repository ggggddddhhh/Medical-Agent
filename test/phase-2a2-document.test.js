import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const resultUrl = new URL("../evaluation/results/deepseek-v4-flash-phase-2a2.json", import.meta.url);
const reportUrl = new URL("../docs/phase-2a2-robustness-validation.md", import.meta.url);

function readResult() {
  return JSON.parse(readFileSync(resultUrl, "utf8"));
}

test("sealed Phase 2A.2 result preserves the measured safety metrics", () => {
  const result = readResult();

  assert.deepEqual(result.caseCounts, {
    baselineGold: 24,
    legacySentinels: 8,
    phase2a1Sentinels: 8,
    developmentVariants: 60,
    blindHoldout: 40,
    total: 140,
    executions: 420,
  });
  assert.equal(result.runs, 3);
  assert.equal(result.safetyMetrics.criticalSemanticMissCount, 126);
  assert.equal(result.safetyMetrics.unsupportedAcceptCount, 45);
  assert.equal(result.safetyMetrics.redFlags.safelyRouted, 132);
  assert.equal(result.safetyMetrics.redFlags.total, 264);
  assert.equal(result.safetyMetrics.uncertainties.safelyRouted, 21);
  assert.equal(result.safetyMetrics.uncertainties.total, 39);
  assert.equal(result.safetyMetrics.hallucinations.rejected, 186);
  assert.equal(result.safetyMetrics.hallucinations.total, 231);
  assert.equal(result.holdoutResults.passedCases, 12);
  assert.equal(result.holdoutResults.cases, 40);
  assert.equal(result.verifierMetrics.correct, 257);
  assert.equal(result.verifierMetrics.total, 431);
  assert.equal(result.verifierMetrics.supportedWithoutEvidenceAccepted, 0);
  assert.equal(result.clinicalSemanticDrift.extractor.casesWithDrift, 17);
  assert.equal(result.clinicalSemanticDrift.gate.casesWithDrift, 16);
  assert.equal(result.providerFailureCount, 0);
  assert.equal(result.verifierFailureCount, 0);
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.phase2B, "NOT_READY");
});

test("Phase 2A.2 report documents isolation, semantic drift and conservative verdict", () => {
  const report = readFileSync(reportUrl, "utf8");

  for (const required of [
    "b25c8b1f1214b23e49fd0f64343ce950963a7b78",
    "772db62c990eb78784dcf6b4498167c46167c6194d085d9ab91c0dbee769ae6f",
    "Critical Semantic Miss",
    "Unsupported ACCEPT",
    "Clinical Semantic Drift",
    "Verifier Accuracy",
    "FAIL",
    "NOT_READY FOR PHASE 2B",
  ]) {
    assert.match(report, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("sealed result excludes raw patient text, prompts, reasoning and API credentials", () => {
  const result = readResult();
  const forbiddenKeys = new Set([
    "input",
    "patientUtterance",
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
