import test from "node:test";
import assert from "node:assert/strict";

import {
  HybridSemanticValidator,
  MedicalSafetyAgent,
  SEMANTIC_SCHEMA_VERSION,
  SemanticExtractor,
  SemanticShadowAgent,
  VerifierVerdict,
} from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";

const headache = getProtocol("headache");

test("hybrid validator can accept detector-derived hidden red flag only after targeted support", async () => {
  const validator = hybrid(VerifierVerdict.SUPPORTED);
  const result = await validator.validate({
    message: "头痛时右边胳膊突然没劲。",
    protocol: headache,
    extraction: validExtraction([]),
  });
  const decision = result.decisions.find((item) => item.factPath === "redFlags.neurologicalDeficit");
  assert.equal(decision.candidateSource, "detector");
  assert.equal(decision.decision, "ACCEPT");
  assert.ok(decision.evidence.evidence[0].text);
});

test("hybrid validator routes quoted, uncertain, conflicting and unsupported facts safely", async () => {
  const validator = hybrid(VerifierVerdict.SUPPORTED);
  const quoted = await validator.validate({
    message: "网上说‘突然头痛’很危险。",
    protocol: headache,
    extraction: validExtraction([]),
  });
  assert.ok(quoted.decisions.every((item) => item.decision === "UNCERTAIN"));

  const hallucinated = await validator.validate({
    message: "我头痛两个小时。",
    protocol: headache,
    extraction: validExtraction([fact("redFlags.neurologicalDeficit", true)]),
  });
  assert.equal(find(hallucinated, "redFlags.neurologicalDeficit").decision, "REJECT");

  const conflict = await validator.validate({
    message: "更正一下，现在右边胳膊没劲。",
    protocol: headache,
    extraction: validExtraction([fact("redFlags.neurologicalDeficit", true)]),
    contextFacts: [fact("redFlags.neurologicalDeficit", false)],
  });
  assert.equal(find(conflict, "redFlags.neurologicalDeficit").decision, "UNCERTAIN");
  assert.ok(conflict.shadowFollowUpProposals.length > 0);
});

test("hybrid Shadow Mode stores no raw evidence and cannot alter CaseState", async () => {
  const marker = "隐私原文标记-HYBRID-888";
  const extractor = new SemanticExtractor({
    provider: {
      name: "DeepSeek",
      model: "deepseek-v4-flash",
      generate: () => ({ schemaVersion: SEMANTIC_SCHEMA_VERSION, pathway: headache.code, facts: [] }),
    },
  });
  const shadow = new SemanticShadowAgent({
    agent: new MedicalSafetyAgent(),
    extractor,
    hybridValidator: hybrid(VerifierVerdict.SUPPORTED),
  });
  const sessionId = shadow.startSession({ adultConfirmed: true });
  const response = shadow.handleMessage(sessionId, `我头痛，右边胳膊突然没劲，${marker}`);
  await shadow.waitForShadowEvaluations(sessionId);
  assert.equal(response.disposition, "EMERGENCY_NOW");
  assert.doesNotMatch(JSON.stringify(shadow.getShadowEvaluations(sessionId)), new RegExp(marker));
  assert.ok(shadow.getShadowEvaluations(sessionId)[0].hybridValidation);
});

function hybrid(verdict) {
  return new HybridSemanticValidator({
    verifier: { verify: async () => ({ status: "completed", verdict, errorCode: null }) },
  });
}

function validExtraction(facts) {
  return {
    extractionStatus: "completed",
    validationStatus: "valid",
    candidate: { schemaVersion: SEMANTIC_SCHEMA_VERSION, pathway: headache.code, facts },
  };
}

function fact(path, value) {
  return { path, value, status: "known", confidence: 0.9, temporality: "current", contradictionCandidate: false };
}

function find(result, path) {
  return result.decisions.find((item) => item.factPath === path);
}
