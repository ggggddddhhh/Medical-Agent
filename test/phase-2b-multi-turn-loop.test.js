import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  HybridSemanticValidator,
  MultiTurnAgentLoop,
  SEMANTIC_SCHEMA_VERSION,
  SemanticExtractor,
  TargetedVerifier,
} from "../src/index.js";

test("subject clarification is consumed on the next turn and updates the same CaseState", async () => {
  const loop = controlledLoop();
  const sessionId = loop.startSession({ adultConfirmed: true });

  const first = await loop.handleMessage(sessionId, "我朋友胸口疼，我也有点不舒服。");
  assert.equal(first.sessionId, sessionId);
  assert.match(first.notice, /不是诊断或处方/);
  assert.equal(first.action, AgentAction.ASK_MORE);
  assert.equal(first.pendingClarification.source, "semantic");
  assert.equal(first.pendingClarification.factPath, "chiefComplaint.code");
  assert.match(first.message, /您本人.*其他人/);
  assert.equal(loop.getSession(sessionId).state.chiefComplaint.code, null);

  const second = await loop.handleMessage(sessionId, "是我本人");
  const session = loop.getSession(sessionId);
  assert.equal(session.state.sessionId, sessionId);
  assert.equal(session.state.chiefComplaint.code, "chest_pain");
  assert.equal(session.state.turnCount, 2);
  assert.equal(second.action, AgentAction.ASK_MORE);
  assert.equal(second.question.id, "CHEST_PAIN_BREATHING");
  assert.equal(second.pendingClarification.source, "core");
  assert.equal(loop.getDecisionTraces(sessionId).length, 2);
});

test("a short high-risk clarification answer is gated, persisted and re-evaluated immediately", async () => {
  const loop = controlledLoop();
  const sessionId = loop.startSession({ adultConfirmed: true });

  const first = await loop.handleMessage(sessionId, "我胸痛，可能喘不过气。");
  assert.equal(first.action, AgentAction.ASK_MORE);
  assert.equal(first.pendingClarification.factPath, "redFlags.difficultyBreathing");

  const second = await loop.handleMessage(sessionId, "有");
  assert.equal(second.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(second.disposition, "EMERGENCY_NOW");
  assert.equal(loop.getSession(sessionId).state.redFlags.difficultyBreathing, true);
  assert.equal(second.semantic.decisions.some((item) =>
    item.factPath === "redFlags.difficultyBreathing" && item.decision === "ACCEPT"), true);
});

test("confirming the symptom belongs to another person rejects it without contaminating CaseState", async () => {
  const loop = controlledLoop();
  const sessionId = loop.startSession({ adultConfirmed: true });
  await loop.handleMessage(sessionId, "我朋友胸口疼，我也有点不舒服。");

  const response = await loop.handleMessage(sessionId, "是朋友，不是我");
  assert.equal(response.action, AgentAction.OUT_OF_SCOPE);
  assert.equal(response.semantic.decisions.some((item) =>
    item.factPath === "chiefComplaint.code" && item.decision === "REJECT"), true);
  assert.equal(loop.getSession(sessionId).state.chiefComplaint.code, null);
});

test("existing Core questions remain multi-turn and update the same session", async () => {
  const loop = controlledLoop();
  const sessionId = loop.startSession({ adultConfirmed: true });

  const first = await loop.handleMessage(sessionId, "我胸痛");
  assert.equal(first.question.id, "CHEST_PAIN_BREATHING");
  assert.equal(first.pendingClarification.source, "core");

  const second = await loop.handleMessage(sessionId, "没有");
  const state = loop.getSession(sessionId).state;
  assert.equal(state.sessionId, sessionId);
  assert.equal(state.redFlags.difficultyBreathing, false);
  assert.equal(second.question.id, "CHEST_PAIN_PRESSURE");
});

test("subject ambiguity interrupts a Core question before raw answer parsing can contaminate state", async () => {
  const loop = controlledLoop();
  const sessionId = loop.startSession({ adultConfirmed: true });
  await loop.handleMessage(sessionId, "我胸痛");

  const ambiguous = await loop.handleMessage(
    sessionId,
    "我朋友喘不过气，我也有点不舒服",
  );
  assert.equal(ambiguous.action, AgentAction.ASK_MORE);
  assert.equal(ambiguous.pendingClarification.source, "semantic");
  assert.equal(ambiguous.pendingClarification.factPath, "redFlags.difficultyBreathing");
  assert.equal(loop.getSession(sessionId).state.redFlags.difficultyBreathing, undefined);

  const resolved = await loop.handleMessage(sessionId, "是朋友，不是我");
  assert.equal(loop.getSession(sessionId).state.redFlags.difficultyBreathing, undefined);
  assert.equal(resolved.action, AgentAction.ASK_MORE);
  assert.equal(resolved.question.id, "CHEST_PAIN_BREATHING");
});

test("model-service failure falls back to the unchanged Phase 1 emergency core", async () => {
  const loop = controlledLoop({ failExtraction: true });
  const sessionId = loop.startSession({ adultConfirmed: true });
  const response = await loop.handleMessage(sessionId, "突然出现这辈子最严重的头痛");

  assert.equal(response.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(response.disposition, "EMERGENCY_NOW");
  assert.equal(response.semantic.fallbackToSafetyCore, true);
  assert.equal(loop.getAudit(sessionId).at(-1).disposition, "EMERGENCY_NOW");
});

test("Phase 2B traces are structured and exclude raw patient text", async () => {
  const marker = "RAW-PATIENT-MARKER-2B";
  const loop = controlledLoop();
  const sessionId = loop.startSession({ adultConfirmed: true });
  await loop.handleMessage(sessionId, `我胸痛 ${marker}`);

  const traces = JSON.stringify(loop.getDecisionTraces(sessionId));
  assert.doesNotMatch(traces, new RegExp(marker));
  assert.match(traces, /acceptedFactPaths/);
  assert.match(traces, /coreDecisionTraceId/);
});

function controlledLoop({ failExtraction = false } = {}) {
  const provider = {
    name: "controlled-python-service",
    model: "controlled-model",
    baseApiFormat: "test",
    async generate({ message, schemaName = "clinical_fact_extraction" }) {
      if (schemaName === "targeted_fact_verification") {
        return JSON.stringify({ verdict: "SUPPORTED" });
      }
      if (failExtraction) throw new Error("python service offline");
      return JSON.stringify(extractionFor(message));
    },
  };
  const extractor = new SemanticExtractor({ provider });
  const verifier = new TargetedVerifier({ provider });
  return new MultiTurnAgentLoop({
    extractor,
    hybridValidator: new HybridSemanticValidator({ verifier }),
  });
}

function extractionFor(message) {
  const pathway = /胸|心口|喘|有$|没有$|本人|朋友/.test(message)
    ? "CHEST_PAIN_V1"
    : "HEADACHE_V1";
  const facts = [];
  if (/胸口疼|胸痛|我胸痛/.test(message)) facts.push(fact("chiefComplaint.code", "chest_pain"));
  if (/喘不过气/.test(message)) {
    facts.push(fact(
      "redFlags.difficultyBreathing",
      /可能/.test(message) ? null : true,
      /可能/.test(message) ? "uncertain" : "known",
    ));
  }
  if (/头痛/.test(message)) facts.push(fact("chiefComplaint.code", "headache"));
  return { schemaVersion: SEMANTIC_SCHEMA_VERSION, pathway, facts };
}

function fact(path, value, status = "known") {
  return {
    path,
    value,
    status,
    confidence: status === "known" ? 0.95 : 0.5,
    temporality: "current",
    contradictionCandidate: false,
  };
}
