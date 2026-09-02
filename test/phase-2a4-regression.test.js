import test from "node:test";
import assert from "node:assert/strict";

import {
  HybridSemanticValidator,
  SEMANTIC_SCHEMA_VERSION,
  VerifierVerdict,
} from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";
import { phase2a4CriticalRegressions } from "../evaluation/phase-2a4-critical-regressions.js";

const validator = new HybridSemanticValidator({
  verifier: {
    metadata: { modelName: "fixed-regression-verifier" },
    verify: async () => ({
      status: "completed",
      verdict: VerifierVerdict.SUPPORTED,
      errorCode: null,
    }),
  },
});

test("Phase 2A.4 contains 24 competition-oriented critical regressions", () => {
  assert.equal(phase2a4CriticalRegressions.length, 24);
  assert.equal(new Set(phase2a4CriticalRegressions.map((item) => item.id)).size, 24);
});

for (const item of phase2a4CriticalRegressions) {
  test(`${item.id} safely preserves evidence, attributes and routing`, async () => {
    const protocol = protocolFor(item.pathway);
    const result = await validator.validate({
      message: item.input,
      protocol,
      extraction: {
        extractionStatus: "completed",
        validationStatus: "valid",
        candidate: {
          schemaVersion: SEMANTIC_SCHEMA_VERSION,
          pathway: item.pathway,
          facts: structuredClone(item.expectedFacts),
        },
      },
    });

    for (const expected of item.attributeExpectations) {
      const assertion = result.linguisticAssertions.assertions.find((value) =>
        value.evidence.some((span) => span.text === expected.evidenceText) &&
        value.conceptHints.some((hint) => hint.factPath === expected.path));
      assert.ok(assertion, `${item.id}: ${expected.evidenceText}`);
      assert.equal(assertion.evidenceExact, true);
      for (const attribute of ["subject", "polarity", "certainty", "temporality"]) {
        assert.equal(assertion[attribute], expected[attribute], `${item.id}: ${attribute}`);
      }
    }

    for (const expected of item.expectedMappings) {
      const mapped = result.conceptMapping.mappedFacts.find((value) =>
        value.fact.path === expected.path)?.fact;
      assert.ok(mapped, `${item.id}: mapped ${expected.path}`);
      assert.equal(mapped.status, expected.status);
      assert.deepEqual(mapped.value, expected.value);
      assert.equal(mapped.temporality, expected.temporality);
    }

    for (const path of item.expectedUncertainties) {
      const decision = findDecision(result, path);
      assert.equal(decision.decision, "UNCERTAIN", `${item.id}: ${path}`);
      assert.ok(decision.clarification, `${item.id}: clarification ${path}`);
      assert.ok(decision.shadowFollowUpProposal, `${item.id}: follow-up ${path}`);
    }

    const expectedByPath = new Map(item.expectedFacts.map((fact) => [fact.path, fact]));
    for (const decision of result.decisions) {
      if (decision.decision !== "ACCEPT") continue;
      const expected = expectedByPath.get(decision.factPath);
      assert.ok(expected, `${item.id}: unsupported ACCEPT ${decision.factPath}`);
      assert.equal(expected.status, "known", `${item.id}: uncertain fact accepted`);
      assert.deepEqual(decision.candidate.value, expected.value);
      assert.equal(decision.candidate.temporality, expected.temporality);
    }

    for (const expected of item.expectedFacts.filter((fact) =>
      fact.status === "known" && isHighRisk(expectedPath(fact)))) {
      assert.equal(findDecision(result, expected.path).decision, "ACCEPT", `${item.id}: ${expected.path}`);
    }
  });
}

function protocolFor(pathway) {
  return getProtocol(pathway === "HEADACHE_V1" ? "headache" : "chest_pain");
}

function findDecision(result, path) {
  const decision = result.decisions.find((item) => item.factPath === path);
  assert.ok(decision, path);
  return decision;
}

function expectedPath(fact) {
  return fact.path;
}

function isHighRisk(path) {
  return path.startsWith("redFlags.") || [
    "symptoms.suddenOnset",
    "symptoms.rapidPeak",
    "symptoms.persistentSevere",
  ].includes(path);
}
