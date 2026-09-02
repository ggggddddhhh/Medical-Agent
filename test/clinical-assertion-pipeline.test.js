import test from "node:test";
import assert from "node:assert/strict";

import {
  ConceptMapper,
  ConversationReconciler,
  EvidenceSpanFinder,
  HybridSemanticValidator,
  LinguisticAssertionLayer,
  SAFETY_SIGNAL_DETECTOR_VERSION,
  SEMANTIC_SCHEMA_VERSION,
  SafetySignalDetector,
  VerifierVerdict,
} from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";

const headache = getProtocol("headache");
const chest = getProtocol("chest_pain");
const spanFinder = new EvidenceSpanFinder();
const assertionLayer = new LinguisticAssertionLayer();
const detector = new SafetySignalDetector({ spanFinder });
const mapper = new ConceptMapper();

test("Evidence Span Finder returns only exact substrings from patient text", () => {
  const message = "胸口像石头压住，气也吸不满。";
  const result = spanFinder.find({ message, protocol: chest });
  assert.ok(result.spans.length >= 2);
  for (const span of result.spans) {
    assert.equal(span.exact, true);
    assert.equal(span.text, message.slice(span.start, span.end));
  }
});

test("Linguistic Assertion Layer separates subject, polarity, certainty and temporality", async (t) => {
  const cases = [
    ["patient", "我现在胸痛，还喘不上气。", "patient", "positive", "certain", "current"],
    ["other person", "我朋友胸痛，还喘不上气。", "other", "positive", "certain", "current"],
    ["negation", "我胸痛，但没有喘不上气。", "patient", "negative", "certain", "current"],
    ["uncertainty", "我胸痛，可能有点喘不上气。", "patient", "positive", "uncertain", "current"],
    ["past", "昨天胸痛时喘不上气。", "patient", "positive", "certain", "previous"],
  ];
  for (const [name, message, subject, polarity, certainty, temporality] of cases) {
    await t.test(name, () => {
      const assertion = assertionFor(message, chest, "redFlags.difficultyBreathing");
      assert.equal(assertion.subject, subject);
      assert.equal(assertion.polarity, polarity);
      assert.equal(assertion.certainty, certainty);
      assert.equal(assertion.temporality, temporality);
    });
  }
});

test("quote and hypothetical are independent assertion attributes", () => {
  const quoted = assertionFor("网上文章写着“突然头痛”。", headache, "symptoms.suddenOnset");
  assert.equal(quoted.quote, true);
  assert.equal(quoted.hypothetical, false);

  const hypothetical = assertionFor("如果以后突然头痛怎么办？", headache, "symptoms.suddenOnset");
  assert.equal(hypothetical.quote, false);
  assert.equal(hypothetical.hypothetical, true);
});

test("SafetySignalDetector emits concept candidates without deciding language attributes or disposition", () => {
  const result = detector.detect({ message: "我朋友胸痛，还喘不上气。", protocol: chest });
  const candidate = result.candidates.find((item) => item.factPath === "redFlags.difficultyBreathing");
  assert.ok(candidate);
  assert.equal(result.detectorVersion, SAFETY_SIGNAL_DETECTOR_VERSION);
  assert.ok(!Object.hasOwn(candidate, "polarity"));
  assert.ok(!Object.hasOwn(candidate, "temporality"));
  assert.doesNotMatch(JSON.stringify(result), /disposition|EMERGENCY_NOW|diagnosis|treatment/);
});

test("Concept Mapper forms Clinical Facts only from attributed exact evidence", () => {
  const message = "昨天胸痛时喘不上气。";
  const spans = spanFinder.find({ message, protocol: chest }).spans;
  const assertions = assertionLayer.analyze({ message, spans }).assertions;
  const candidates = detector.detect({ message, protocol: chest, evidenceSpans: spans }).candidates;
  const result = mapper.map({ assertions, detectorCandidates: candidates, protocol: chest });
  const mapped = result.mappedFacts.find((item) => item.fact.path === "redFlags.difficultyBreathing");
  assert.equal(mapped.fact.value, true);
  assert.equal(mapped.fact.temporality, "previous");
  assert.equal(mapped.assertion.subject, "patient");
  assert.equal(mapped.evidence.support, "supporting");
});

test("known LLM fact without located evidence is rejected even when verifier supports it", async () => {
  const result = await validator(VerifierVerdict.SUPPORTED).validate({
    message: "我头痛两个小时，只说了这些。",
    protocol: headache,
    extraction: extraction(headache, [known("redFlags.neurologicalDeficit", true)]),
  });
  const decision = findDecision(result, "redFlags.neurologicalDeficit");
  assert.equal(decision.decision, "REJECT");
  assert.equal(decision.evidence.support, "none");
});

test("uncertain and conflicting high-risk evidence triggers targeted clarification", async () => {
  const uncertain = await validator(VerifierVerdict.SUPPORTED).validate({
    message: "我胸痛，好像有点喘不上气，但不确定。",
    protocol: chest,
    extraction: extraction(chest, []),
  });
  assert.equal(findDecision(uncertain, "redFlags.difficultyBreathing").decision, "UNCERTAIN");
  assert.ok(findDecision(uncertain, "redFlags.difficultyBreathing").shadowFollowUpProposal);

  const conflict = await validator(VerifierVerdict.SUPPORTED).validate({
    message: "我没有喘不上气，可刚才又确实喘不上气。",
    protocol: chest,
    extraction: extraction(chest, []),
  });
  assert.equal(findDecision(conflict, "redFlags.difficultyBreathing").decision, "UNCERTAIN");
  assert.ok(findDecision(conflict, "redFlags.difficultyBreathing").clarification);
});

test("explicit grounded correction overrides the old value and preserves reconciliation trace", async () => {
  const result = await validator(VerifierVerdict.SUPPORTED).validate({
    message: "更正一下，我刚才说错了，确实有右手无力。",
    protocol: headache,
    extraction: extraction(headache, []),
    contextFacts: [known("redFlags.neurologicalDeficit", false, "previous")],
  });
  const decision = findDecision(result, "redFlags.neurologicalDeficit");
  assert.equal(decision.decision, "ACCEPT");
  assert.equal(decision.candidate.value, true);
  assert.equal(decision.candidate.contradictionCandidate, true);
  assert.equal(decision.reconciliation.status, "CORRECTION_APPLIED");
  assert.equal(decision.reconciliation.previousFact.value, false);
});

test("other-person, quoted and hypothetical concepts are rejected", async () => {
  for (const message of [
    "我朋友胸痛，还喘不上气。",
    "资料里写着“胸痛伴喘不上气”。",
    "如果胸痛时喘不上气该怎么办？",
  ]) {
    const result = await validator(VerifierVerdict.SUPPORTED).validate({
      message,
      protocol: chest,
      extraction: extraction(chest, []),
    });
    assert.equal(findDecision(result, "redFlags.difficultyBreathing").decision, "REJECT", message);
  }
});

function assertionFor(message, protocol, path) {
  const spans = spanFinder.find({ message, protocol }).spans;
  const assertions = assertionLayer.analyze({ message, spans }).assertions;
  const assertion = assertions.find((item) =>
    item.conceptHints.some((hint) => hint.factPath === path));
  assert.ok(assertion, path);
  return assertion;
}

function validator(verdict) {
  return new HybridSemanticValidator({
    verifier: {
      verify: async () => ({ status: "completed", verdict, errorCode: null }),
    },
  });
}

function extraction(protocol, facts) {
  return {
    extractionStatus: "completed",
    validationStatus: "valid",
    candidate: {
      schemaVersion: SEMANTIC_SCHEMA_VERSION,
      pathway: protocol.code,
      facts,
    },
  };
}

function known(path, value, temporality = "current") {
  return {
    path,
    value,
    status: "known",
    confidence: 0.9,
    temporality,
    contradictionCandidate: false,
  };
}

function findDecision(result, path) {
  const decision = result.decisions.find((item) => item.factPath === path);
  assert.ok(decision, path);
  return decision;
}
