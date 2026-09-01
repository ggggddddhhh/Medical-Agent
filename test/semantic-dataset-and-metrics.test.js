import test from "node:test";
import assert from "node:assert/strict";

import { evaluateSemanticPredictions, validateExtractionEnvelope } from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";
import {
  expectedEnvelope,
  phase2aGoldDataset,
  phase2aSemanticSentinels,
} from "../evaluation/phase-2a-gold-dataset.js";

test("Gold Dataset has 24 balanced cases with explicit semantic expectations", () => {
  assert.equal(phase2aGoldDataset.length, 24);
  assert.equal(phase2aGoldDataset.filter((item) => item.pathway === "HEADACHE_V1").length, 12);
  assert.equal(phase2aGoldDataset.filter((item) => item.pathway === "CHEST_PAIN_V1").length, 12);
  for (const item of phase2aGoldDataset) {
    for (const key of ["input", "expectedFacts", "expectedUnknownFacts", "expectedNegations", "expectedUncertainties"]) {
      assert.ok(Object.hasOwn(item, key), `${item.id}:${key}`);
    }
  }
});
test("Semantic Sentinel Set has eight schema-valid high-risk cases", () => {
  assert.equal(phase2aSemanticSentinels.length, 8);
  for (const item of phase2aSemanticSentinels) {
    const complaint = item.pathway === "HEADACHE_V1" ? "headache" : "chest_pain";
    assert.doesNotThrow(() =>
      validateExtractionEnvelope(expectedEnvelope(item), getProtocol(complaint)),
      item.id,
    );
    assert.ok(item.expectedFacts.some((fact) => fact.path.startsWith("redFlags.") || ["symptoms.suddenOnset", "symptoms.rapidPeak", "symptoms.persistentSevere"].includes(fact.path)));
  }
});

test("all Gold expected envelopes satisfy their pathway schema", () => {
  for (const item of phase2aGoldDataset) {
    const complaint = item.pathway === "HEADACHE_V1" ? "headache" : "chest_pain";
    assert.doesNotThrow(() =>
      validateExtractionEnvelope(expectedEnvelope(item), getProtocol(complaint)),
      item.id,
    );
  }
});

test("evaluation metrics cover all ten required measures", () => {
  const cases = [...phase2aGoldDataset, ...phase2aSemanticSentinels].map((item) => ({
    ...item,
    prediction: { validationStatus: "valid", candidate: expectedEnvelope(item) },
  }));
  const metrics = evaluateSemanticPredictions(cases);
  for (const key of [
    "schemaValidityRate", "factPrecision", "factRecall", "redFlagFactRecall",
    "negationAccuracy", "unknownAccuracy", "uncertaintyAccuracy",
    "hallucinatedFactRate", "conflictDetectionAccuracy", "semanticSentinelPassRate",
  ]) {
    assert.ok(Object.hasOwn(metrics, key), key);
  }
  assert.equal(metrics.schemaValidityRate, 1);
  assert.equal(metrics.semanticSentinelPassRate, 1);
  assert.equal(metrics.hallucinatedFactRate, 0);
});

test("hallucinated fact rate detects unsupported model additions", () => {
  const item = phase2aGoldDataset.find((candidate) => candidate.id === "H-GOLD-12");
  const prediction = expectedEnvelope(item);
  prediction.facts.push({
    path: "redFlags.neurologicalDeficit", value: false, status: "known",
    confidence: 0.8, temporality: "current", contradictionCandidate: false,
  });
  const metrics = evaluateSemanticPredictions([{ ...item, prediction: { validationStatus: "valid", candidate: prediction } }]);
  assert.ok(metrics.hallucinatedFactRate > 0);
  assert.ok(metrics.unknownAccuracy < 1);
});
