import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const analysis = readFileSync(new URL("../docs/phase-2a1-failure-analysis.md", import.meta.url), "utf8");
const architecture = readFileSync(new URL("../docs/phase-2a1-hybrid-semantic-architecture.md", import.meta.url), "utf8");
const result = JSON.parse(readFileSync(new URL("../evaluation/results/deepseek-v4-flash-phase-2a1.json", import.meta.url), "utf8"));

test("Phase 2A.1 failure analysis covers every required class and all eight legacy Sentinels", () => {
  for (const label of [
    "MISS", "FALSE_POSITIVE", "HALLUCINATION", "NEGATION_ERROR", "UNKNOWN_COLLAPSE",
    "UNCERTAINTY_COLLAPSE", "TEMPORALITY_ERROR", "CONFLICT_ERROR", "SCHEMA_FAILURE",
    "RUN_TO_RUN_DRIFT", "RED_FLAG_MISS", "GOLD_LABEL_SUSPECT", "SCHEMA_DESIGN_SUSPECT",
    "PROMPT_DESIGN_SUSPECT", "MODEL_CAPABILITY_LIMIT", "OTHER",
  ]) assert.match(analysis, new RegExp(label));
  for (const id of ["H-SENT-01", "H-SENT-02", "H-SENT-03", "H-SENT-04", "C-SENT-01", "C-SENT-02", "C-SENT-03", "C-SENT-04"]) {
    assert.match(analysis, new RegExp(id));
  }
  assert.match(analysis, /Architecture issue[\s\S]*PRIMARY/);
  assert.match(analysis, /Gold issue[\s\S]*MINOR/);
});

test("Phase 2A.1 architecture documents components, gate rules, limitations and promotion boundary", () => {
  for (const heading of [
    "Current Failure", "Why Single-LLM Extraction Failed", "New Architecture", "Semantic Extractor",
    "Safety Signal Detector", "Targeted Verifier", "Semantic Gate", "ACCEPT / UNCERTAIN / REJECT",
    "Failure Handling", "High-Risk Fact Handling", "Hallucination Guard", "Shadow Follow-up",
    "Evaluation Plan", "Known Limitations", "Clinical Validation Status", "Phase 2B Promotion Criteria",
  ]) assert.match(architecture, new RegExp(heading));
  assert.match(architecture, /correlated error risk/);
  assert.match(architecture, /Clinical validation pending/);
  assert.match(architecture, /Phase 2B：`NOT_READY`/);
  assert.doesNotMatch(architecture, /clinically validated|medically validated|safe for clinical deployment/i);
});

test("Phase 2A.1 documents match the sanitized formal artifact", () => {
  assert.equal(result.evaluationTimestamp, "2026-09-01T11:58:56.025Z");
  assert.equal(result.hybridMetrics.redFlagDetectorRecall, 1);
  assert.equal(result.hybridMetrics.hallucinationRejectionRate, 1);
  assert.equal(result.hybridMetrics.uncertaintySafeRoutingAccuracy, 1);
  assert.equal(result.criticalSemanticMissesAfterGate.length, 0);
  assert.equal(result.legacySentinelPassRateAfterGate, 1);
  assert.equal(result.phase2a1SentinelPassRate, 1);
  assert.equal(result.verdict, "PASS_WITH_CONDITIONS");
  assert.equal(result.phase2B, "NOT_READY");
  assert.equal(JSON.stringify(result).includes("patientUtterance"), false);
});
