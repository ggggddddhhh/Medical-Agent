import test from "node:test";
import assert from "node:assert/strict";

import {
  decideSemanticFact,
  SemanticGateDecision,
  VerifierVerdict,
} from "../src/index.js";

const trueFact = {
  path: "redFlags.difficultyBreathing",
  value: true,
  status: "known",
  confidence: 0.9,
  temporality: "current",
  contradictionCandidate: false,
};
const positive = {
  factPath: trueFact.path,
  proposedValue: true,
  polarity: "positive",
  temporality: "current",
};
const evidence = { support: "supporting", method: "detector", evidence: [{ text: "喘不上气" }] };
const supported = { status: "completed", verdict: VerifierVerdict.SUPPORTED };

test("Semantic Gate implements agreement, conflict, evidence and fail-safe rules", async (t) => {
  const cases = [
    ["LLM true + detector true", {}, SemanticGateDecision.ACCEPT],
    ["LLM false + detector true", { candidate: { ...trueFact, value: false } }, SemanticGateDecision.UNCERTAIN],
    ["LLM unknown + detector true", { candidate: { ...trueFact, value: null, status: "unknown" } }, SemanticGateDecision.UNCERTAIN],
    ["LLM true + no evidence", { evidence: { support: "none", method: "none", evidence: [] } }, SemanticGateDecision.REJECT],
    ["LLM true + explicit negation", { detectorCandidate: { ...positive, polarity: "negative" } }, SemanticGateDecision.REJECT],
    ["uncertain user statement", { detectorCandidate: { ...positive, polarity: "uncertain" } }, SemanticGateDecision.UNCERTAIN],
    ["conflicting multi-turn statements", { contextConflict: true }, SemanticGateDecision.UNCERTAIN],
    ["schema invalid", { extractionValid: false }, SemanticGateDecision.REJECT],
    ["source temporality conflict", { evidence: { ...evidence, temporality: "previous" } }, SemanticGateDecision.UNCERTAIN],
  ];
  for (const [name, overrides, expected] of cases) {
    await t.test(name, () => {
      const result = decideSemanticFact({
        candidate: trueFact,
        candidateSource: "llm+detector",
        extractionValid: true,
        detectorCandidate: positive,
        evidence,
        verifier: supported,
        verifierRequired: true,
        ...overrides,
      });
      assert.equal(result.decision, expected);
    });
  }
});

test("any required verifier failure cannot promote UNCERTAIN to ACCEPT", () => {
  for (const verifier of [
    null,
    { status: "timeout", verdict: VerifierVerdict.UNCERTAIN },
    { status: "provider_error", verdict: VerifierVerdict.UNCERTAIN },
    { status: "completed", verdict: VerifierVerdict.UNCERTAIN },
  ]) {
    const result = decideSemanticFact({
      candidate: trueFact,
      candidateSource: "llm+detector",
      detectorCandidate: positive,
      evidence,
      verifier,
      verifierRequired: true,
    });
    assert.equal(result.decision, SemanticGateDecision.UNCERTAIN);
  }
});
