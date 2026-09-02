import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateClinicalAssertionMetrics,
  HybridSemanticValidator,
} from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";

test("clinical assertion metrics independently score all seven pipeline modules", async () => {
  const item = {
    id: "ATTR-01",
    datasetKind: "blind_holdout",
    pathway: "CHEST_PAIN_V1",
    attributeExpectations: [{
      path: "redFlags.difficultyBreathing",
      evidenceText: "喘不上气",
      subject: "patient",
      polarity: "positive",
      certainty: "uncertain",
      temporality: "previous",
    }],
    expectedMappings: [{
      path: "redFlags.difficultyBreathing",
      status: "uncertain",
      value: null,
      temporality: "previous",
    }],
    expectedClarifications: ["redFlags.difficultyBreathing"],
  };
  const protocol = getProtocol("chest_pain");
  const validator = new HybridSemanticValidator({
    verifier: {
      verify: async () => ({ status: "completed", verdict: "SUPPORTED", errorCode: null }),
    },
  });
  const hybrid = await validator.validate({
    message: "昨天胸痛时可能喘不上气。",
    protocol,
    extraction: {
      extractionStatus: "completed",
      validationStatus: "valid",
      candidate: { facts: [] },
    },
  });
  const result = calculateClinicalAssertionMetrics([{ item, run: 1, hybrid }]);

  for (const name of [
    "evidenceSpanRecall",
    "subjectAccuracy",
    "negationAccuracy",
    "certaintyAccuracy",
    "temporalityAccuracy",
    "conceptMappingAccuracy",
    "clarificationTriggerRecall",
  ]) {
    assert.deepEqual(result[name], { correct: 1, total: 1, rate: 1 }, name);
  }
  assert.deepEqual(result.errors, []);
});

test("assertion metric errors never retain raw evidence text", () => {
  const result = calculateClinicalAssertionMetrics([{
    item: {
      id: "ATTR-PRIVACY",
      datasetKind: "blind_holdout",
      attributeExpectations: [{
        path: "redFlags.difficultyBreathing",
        evidenceText: "RAW-MARKER-991",
        subject: "patient",
      }],
    },
    run: 1,
    hybrid: {
      linguisticAssertions: { assertions: [] },
      conceptMapping: { mappedFacts: [] },
      decisions: [],
    },
  }]);
  assert.doesNotMatch(JSON.stringify(result), /RAW-MARKER-991/);
});
