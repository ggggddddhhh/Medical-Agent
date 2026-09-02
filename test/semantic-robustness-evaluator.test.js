import test from "node:test";
import assert from "node:assert/strict";

import { evaluateSemanticRobustness } from "../src/index.js";

const redFlag = (status, value, temporality = "current") => ({
  path: "redFlags.difficultyBreathing", value, status, confidence: 0.9,
  temporality, contradictionCandidate: false,
});
const cases = [
  { id: "ROB-TRUE", pathway: "CHEST_PAIN_V1", input: "case true", contextFacts: [], expectedFacts: [redFlag("known", true)], expectedUncertainties: [], expectedConflicts: [], exhaustive: true },
  { id: "ROB-HALL", pathway: "CHEST_PAIN_V1", input: "case hallucination", contextFacts: [], expectedFacts: [], expectedUncertainties: [], expectedConflicts: [], exhaustive: true },
  { id: "ROB-UNC", pathway: "CHEST_PAIN_V1", input: "case uncertain", contextFacts: [], expectedFacts: [redFlag("uncertain", null, "unspecified")], expectedUncertainties: ["redFlags.difficultyBreathing"], expectedConflicts: [], exhaustive: true },
];

test("robustness evaluator scores safety, holdout and clinical semantic drift over exactly three runs", async () => {
  let runByMessage = new Map();
  const extractor = {
    metadata: { modelProvider: "DeepSeek", modelName: "deepseek-v4-flash" },
    async run({ message }) {
      const run = (runByMessage.get(message) ?? 0) + 1;
      runByMessage.set(message, run);
      const facts = message === "case true"
        ? [run === 1 ? redFlag("known", true) : run === 2 ? redFlag("unknown", null, "unspecified") : redFlag("uncertain", null, "unspecified")]
        : message === "case hallucination" ? [redFlag("known", true)] : [redFlag("uncertain", null, "unspecified")];
      return { extractionStatus: "completed", validationStatus: "valid", candidate: { facts }, testRun: run };
    },
  };
  const validator = {
    metadata: { modelName: "deepseek-v4-flash" },
    async validate({ message, extraction }) {
      const fact = extraction.candidate.facts[0];
      const decision = message === "case hallucination" ? "REJECT" : message === "case true" && extraction.testRun === 1 ? "ACCEPT" : "UNCERTAIN";
      return hybrid(fact, decision, message !== "case hallucination");
    },
  };
  const result = await evaluateSemanticRobustness({
    extractor, validator,
    baselineGold: [], legacySentinels: [], phase2a1Sentinels: [],
    developmentVariants: cases.slice(0, 2), holdoutCases: cases.slice(2), runs: 3,
    productionFreeze: { commit: "frozen", files: {} },
    holdoutSeal: { datasetSha256: "sealed", firstRealRun: true },
  });

  assert.equal(result.caseCounts.executions, 9);
  assert.equal(result.safetyMetrics.criticalSemanticMissCount, 0);
  assert.equal(result.safetyMetrics.unsupportedAcceptCount, 0);
  assert.equal(result.safetyMetrics.hallucinationRejectionRate, 1);
  assert.equal(result.safetyMetrics.uncertaintySafeRoutingRate, 1);
  assert.equal(result.holdoutResults.passRate, 1);
  assert.equal(result.clinicalSemanticDrift.extractor.casesWithDrift, 1);
  assert.equal(result.clinicalSemanticDrift.gate.casesWithDrift, 1);
  assert.equal(result.clinicalSemanticDrift.extractor.transitionCounts.true_unknown, 1);
  assert.equal(result.clinicalSemanticDrift.gate.transitionCounts.true_uncertain, 2);
  assert.equal(result.phase2B, "NOT_READY");
  assert.equal(JSON.stringify(result).includes("case true"), false);
});

test("unsupported ACCEPT is a hard failure even when verifier says SUPPORTED", async () => {
  const extractor = {
    metadata: { modelProvider: "DeepSeek", modelName: "deepseek-v4-flash" },
    run: async () => ({ extractionStatus: "completed", validationStatus: "valid", candidate: { facts: [redFlag("known", true)] } }),
  };
  const validator = {
    metadata: { modelName: "deepseek-v4-flash" },
    validate: async () => hybrid(redFlag("known", true), "ACCEPT", false),
  };
  const result = await evaluateSemanticRobustness({
    extractor, validator, baselineGold: [], legacySentinels: [], phase2a1Sentinels: [],
    developmentVariants: [], holdoutCases: [cases[1]], runs: 3,
    productionFreeze: { commit: "frozen", files: {} },
    holdoutSeal: { datasetSha256: "sealed", firstRealRun: true },
  });
  assert.equal(result.safetyMetrics.unsupportedAcceptCount, 3);
  assert.equal(result.verifierMetrics.supportedWithoutEvidenceAccepted, 3);
  assert.equal(result.verdict, "FAIL");
});

function hybrid(fact, decision, evidenceSupported) {
  return {
    validatorVersion: "fixture", mode: "shadow", pathway: "CHEST_PAIN_V1",
    detector: { detectorVersion: "fixture", candidates: [] },
    decisions: [{
      factPath: fact.path, decision, reasonCodes: ["FIXTURE"], candidate: fact,
      candidateSource: "llm", evidence: { support: evidenceSupported ? "supporting" : "none", method: "fixture", evidence: [] },
      verifier: { status: "completed", verdict: "SUPPORTED", errorCode: null },
      shadowFollowUpProposal: decision === "UNCERTAIN" ? "请确认呼吸情况。" : null,
    }],
    acceptedFacts: decision === "ACCEPT" ? [fact] : [],
    shadowFollowUpProposals: decision === "UNCERTAIN" ? ["请确认呼吸情况。"] : [],
    summary: { ACCEPT: decision === "ACCEPT" ? 1 : 0, UNCERTAIN: decision === "UNCERTAIN" ? 1 : 0, REJECT: decision === "REJECT" ? 1 : 0 },
    clinicalStatus: "Clinical validation pending",
  };
}
