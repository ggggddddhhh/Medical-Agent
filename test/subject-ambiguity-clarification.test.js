import test from "node:test";
import assert from "node:assert/strict";

import {
  HybridSemanticValidator,
  SEMANTIC_SCHEMA_VERSION,
  VerifierVerdict,
} from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";

const validator = new HybridSemanticValidator({
  verifier: {
    metadata: { modelName: "subject-ambiguity-regression-verifier" },
    verify: async () => ({
      status: "completed",
      verdict: VerifierVerdict.SUPPORTED,
      errorCode: null,
    }),
  },
});

const ambiguityCases = [
  {
    id: "original-phase-2a4-failure",
    pathway: "HEADACHE_V1",
    input: "我也不知道是自己还是朋友头痛时嘴歪。",
    path: "redFlags.neurologicalDeficit",
    value: true,
  },
  {
    id: "mixed-friend-and-self-chief-complaint",
    pathway: "CHEST_PAIN_V1",
    input: "我朋友胸口疼，我也有点不舒服。",
    path: "chiefComplaint.code",
    value: "chest_pain",
    expectedQuestion: "请确认，胸痛的是您本人还是您提到的其他人？",
  },
  {
    id: "shared-subject",
    pathway: "CHEST_PAIN_V1",
    input: "我和室友中有一个胸口像被铁箍勒住。",
    path: "redFlags.pressureOrCrushing",
    value: true,
  },
  {
    id: "unclear-transcription",
    pathway: "HEADACHE_V1",
    input: "记录里写着嘴歪，但没写清是谁。",
    path: "redFlags.neurologicalDeficit",
    value: true,
  },
];

for (const item of ambiguityCases) {
  test(`${item.id} routes SUBJECT_UNCERTAIN to clarification`, async () => {
    const result = await validate(item);
    const decision = findDecision(result, item.path);
    assert.equal(decision.assertion.subject, "unclear");
    assert.equal(decision.decision, "UNCERTAIN");
    assert.ok(decision.clarification);
    assert.ok(decision.clarification.reasonCodes.includes("SUBJECT_UNCERTAIN"));
    assert.equal(decision.shadowFollowUpProposal, decision.clarification.question);
    if (item.expectedQuestion) {
      assert.equal(decision.clarification.question, item.expectedQuestion);
    }
  });
}

test("an explicitly third-person symptom remains REJECT", async () => {
  const result = await validate({
    pathway: "CHEST_PAIN_V1",
    input: "我替父亲问，他胸口像铁箍勒住，这不是我的症状。",
    path: "redFlags.pressureOrCrushing",
    value: true,
  });
  const decision = findDecision(result, "redFlags.pressureOrCrushing");
  assert.equal(decision.assertion.subject, "other");
  assert.equal(decision.decision, "REJECT");
  assert.equal(decision.clarification, null);
});

test("an explicitly patient-owned symptom remains ACCEPT", async () => {
  const result = await validate({
    pathway: "HEADACHE_V1",
    input: "朋友看到我头痛时嘴歪。",
    path: "redFlags.neurologicalDeficit",
    value: true,
  });
  const decision = findDecision(result, "redFlags.neurologicalDeficit");
  assert.equal(decision.assertion.subject, "patient");
  assert.equal(decision.decision, "ACCEPT");
  assert.equal(decision.clarification, null);
});

async function validate(item) {
  const protocol = getProtocol(item.pathway === "HEADACHE_V1" ? "headache" : "chest_pain");
  return validator.validate({
    message: item.input,
    protocol,
    extraction: {
      extractionStatus: "completed",
      validationStatus: "valid",
      candidate: {
        schemaVersion: SEMANTIC_SCHEMA_VERSION,
        pathway: item.pathway,
        facts: [{
          path: item.path,
          value: item.value,
          status: "known",
          confidence: 0.95,
          temporality: "current",
          contradictionCandidate: false,
        }],
      },
    },
  });
}

function findDecision(result, path) {
  const decision = result.decisions.find((item) => item.factPath === path);
  assert.ok(decision, path);
  return decision;
}
