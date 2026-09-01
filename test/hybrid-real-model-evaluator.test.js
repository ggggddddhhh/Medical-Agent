import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateHybridRealModel,
  HybridSemanticValidator,
  SEMANTIC_SCHEMA_VERSION,
  SemanticExtractor,
  TargetedVerifier,
} from "../src/index.js";
import {
  expectedEnvelope,
  phase2aSemanticSentinels,
} from "../evaluation/phase-2a-gold-dataset.js";
import { phase2a1SemanticSentinels } from "../evaluation/phase-2a1-sentinels.js";

test("hybrid evaluator preserves baseline metrics and reports nine Phase 2A.1 metrics", async () => {
  const extractor = new SemanticExtractor({ provider: {
    name: "DeepSeek",
    model: "deepseek-v4-flash",
    baseApiFormat: "Responses API",
    generate: ({ message }) => expectedEnvelope(phase2aSemanticSentinels.find((item) => item.input === message)),
  } });
  const verifier = new TargetedVerifier({ provider: {
    name: "DeepSeek",
    model: "deepseek-v4-flash",
    generate: () => ({ verdict: "SUPPORTED" }),
  } });
  const result = await evaluateHybridRealModel({
    extractor,
    validator: new HybridSemanticValidator({ verifier }),
    goldCases: [],
    legacySentinels: phase2aSemanticSentinels,
    phase2a1Sentinels: [],
    runs: 1,
    evaluationTimestamp: "2026-09-01T00:00:00.000Z",
  });

  assert.equal(result.baselineMetrics.semanticSentinelPassRate, 1);
  assert.equal(result.hybridMetrics.redFlagDetectorRecall, 1);
  assert.equal(result.legacySentinelPassRateAfterGate, 1);
  assert.equal(result.criticalSemanticMissesAfterGate.length, 0);
  for (const key of [
    "semanticGateAcceptPrecision",
    "semanticGateRejectPrecision",
    "semanticGateUncertainRate",
    "redFlagDetectorRecall",
    "redFlagConflictCatchRate",
    "hallucinationRejectionRate",
    "verifierResolutionAccuracy",
    "redFlagSafeRoutingRecall",
    "hallucinatedAcceptedFactRate",
  ]) assert.ok(Object.hasOwn(result.hybridMetrics, key), key);
  assert.equal(JSON.stringify(result).includes("input"), false);
});

test("hybrid evaluator reports extraction drift separately from gate drift", async () => {
  const item = phase2aSemanticSentinels[3];
  let call = 0;
  const extractor = new SemanticExtractor({ provider: {
    name: "DeepSeek",
    model: "deepseek-v4-flash",
    generate: () => {
      call += 1;
      const envelope = expectedEnvelope(item);
      if (call === 2) envelope.facts = [];
      return envelope;
    },
  } });
  const result = await evaluateHybridRealModel({
    extractor,
    validator: new HybridSemanticValidator({ verifier: {
      metadata: { modelName: "deepseek-v4-flash" },
      verify: async () => ({ status: "completed", verdict: "SUPPORTED", errorCode: null }),
    } }),
    goldCases: [],
    legacySentinels: [item],
    phase2a1Sentinels: [],
    runs: 2,
  });
  assert.deepEqual(result.extractionDriftCases, [item.id]);
  assert.deepEqual(result.gateDriftCases, [item.id]);
});

test("Phase 2A.1 Sentinel set retains eight independent safety cases", () => {
  assert.equal(phase2a1SemanticSentinels.length, 8);
  assert.deepEqual(new Set(phase2a1SemanticSentinels.map((item) => item.category)), new Set([
    "hidden_red_flag",
    "colloquial_red_flag",
    "negated_red_flag",
    "uncertain_red_flag",
    "historical_vs_current",
    "quoted_symptom",
    "conflicting_symptom",
    "hallucination_trap",
  ]));
  assert.ok(phase2a1SemanticSentinels.every((item) => item.schemaVersion === undefined));
  assert.equal(SEMANTIC_SCHEMA_VERSION, "clinical-facts-1.0.0");
});
