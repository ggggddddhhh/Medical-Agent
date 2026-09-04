import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPhase5Agent } from "../../../src/phase5/create-phase5-agent.js";

import {
  LangGraphShadowOrchestrator,
  PHASE_51_NODE_MAPPING,
  PHASE_52_TARGET_NODE_MAPPING,
  createPhase51ShadowGraph,
} from "../src/index.js";

test("StateGraph maps Fact Memory and Question Planner without clinical authority", () => {
  assert.deepEqual(PHASE_51_NODE_MAPPING.map((item) => item.node), [
    "capture_turn",
    "reconcile_fact_memory",
    "plan_question",
    "compare_legacy",
  ]);
  assert.equal(PHASE_51_NODE_MAPPING.some((item) => item.authority === "clinical_decision"), false);
  assert.deepEqual(PHASE_52_TARGET_NODE_MAPPING.map((item) => item.node), [
    "accept_input", "semantic_extract", "semantic_gate", "safety_core",
    "reconcile_fact_memory", "plan_question", "clarification_interrupt",
    "response_guard", "knowledge_support",
  ]);
  assert.deepEqual(
    PHASE_52_TARGET_NODE_MAPPING.filter((item) => item.writes.includes("caseState")).map((item) => item.node),
    ["safety_core"],
  );
  const { graph } = createPhase51ShadowGraph();
  assert.equal(typeof graph.invoke, "function");
  assert.equal(typeof graph.getState, "function");
});

test("shadow mode returns the byte-equivalent Legacy response and records a match", async () => {
  const legacy = new SequenceLegacyAgent([turn({ question: breathingQuestion() })]);
  const shadow = new LangGraphShadowOrchestrator({ legacyAgent: legacy });
  const sessionId = shadow.startSession({ adultConfirmed: true });

  const response = await shadow.handleMessage(sessionId, "我胸痛", { clientTurnId: "turn-1" });
  assert.strictEqual(response, legacy.lastResponse);
  assert.equal(shadow.getShadowReport(sessionId).comparison.status, "MATCH");
  assert.equal(shadow.getShadowReport(sessionId).responseSource, "legacy");

  const state = await shadow.getShadowState(sessionId);
  assert.equal(state.plannedQuestion.id, "CHEST_PAIN_BREATHING");
  assert.equal(state.traceEvents.length, 4);
  assert.equal(JSON.stringify(state).includes("我胸痛"), false);
  assert.match(state.messageDigest, /^[a-f0-9]{64}$/);
});

test("shadow comparison detects an answered Legacy question and proposes the next existing pathway question", async () => {
  const answeredState = caseState({
    turnCount: 2,
    facts: {
      "redFlags.difficultyBreathing": known(false, 2),
    },
  });
  const legacy = new SequenceLegacyAgent([turn({
    state: answeredState,
    question: breathingQuestion(),
  })]);
  const shadow = new LangGraphShadowOrchestrator({ legacyAgent: legacy });
  const sessionId = shadow.startSession({ adultConfirmed: true });

  const response = await shadow.handleMessage(sessionId, "没有", { clientTurnId: "turn-duplicate" });
  const report = shadow.getShadowReport(sessionId);

  assert.equal(response.question.id, "CHEST_PAIN_BREATHING");
  assert.equal(report.status, "diverged");
  assert.equal(report.comparison.status, "LEGACY_DUPLICATE");
  assert.equal(report.comparison.legacyFactPath, "redFlags.difficultyBreathing");
  assert.equal(report.plannedQuestion.id, "CHEST_PAIN_PRESSURE");
  assert.equal(report.plannedQuestion.factPath, "redFlags.pressureOrCrushing");
});

test("one LangGraph thread accumulates deterministic node checkpoints across turns", async () => {
  const legacy = new SequenceLegacyAgent([
    turn({ question: breathingQuestion() }),
    turn({
      state: caseState({
        turnCount: 2,
        facts: { "redFlags.difficultyBreathing": known(false, 2) },
      }),
      question: pressureQuestion(),
    }),
  ]);
  const shadow = new LangGraphShadowOrchestrator({ legacyAgent: legacy });
  const sessionId = shadow.startSession({ adultConfirmed: true });

  await shadow.handleMessage(sessionId, "我胸痛", { clientTurnId: "checkpoint-1" });
  await shadow.handleMessage(sessionId, "没有", { clientTurnId: "checkpoint-2" });
  const state = await shadow.getShadowState(sessionId);

  assert.equal(state.clientTurnId, "checkpoint-2");
  assert.equal(state.comparison.status, "MATCH");
  assert.equal(state.factMemory.answeredFactPaths.includes("redFlags.difficultyBreathing"), true);
  assert.equal(state.traceEvents.length, 8);
  assert.equal(new Set(state.traceEvents.map((item) => item.id)).size, 8);
});

test("a Shadow Graph failure cannot block or alter the Legacy medical response", async () => {
  const legacy = new SequenceLegacyAgent([turn({ question: breathingQuestion() })]);
  const graph = {
    async invoke() {
      const error = new Error("prototype unavailable");
      error.code = "SHADOW_CHECKPOINTER_UNAVAILABLE";
      throw error;
    },
    async getState() { return { values: {} }; },
  };
  const shadow = new LangGraphShadowOrchestrator({ legacyAgent: legacy, graph });
  const sessionId = shadow.startSession({ adultConfirmed: true });

  const response = await shadow.handleMessage(sessionId, "我胸痛");
  assert.strictEqual(response, legacy.lastResponse);
  assert.equal(response.question.id, "CHEST_PAIN_BREATHING");
  assert.deepEqual(shadow.getShadowReport(sessionId), {
    version: "phase-5.1-langgraph-shadow-0.1.0",
    mode: "shadow",
    clientTurnId: shadow.getShadowReport(sessionId).clientTurnId,
    responseSource: "legacy",
    status: "shadow_error",
    errorCode: "SHADOW_CHECKPOINTER_UNAVAILABLE",
  });
});

test("the real Legacy Phase 5 Agent stays authoritative while Shadow comparisons match", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "medical-agent-langgraph-shadow-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const offlineFetch = async () => { throw new Error("offline comparison fixture"); };
  const legacy = createPhase5Agent({
    memoryStorageDir: directory,
    fetchImpl: offlineFetch,
    extractionTimeoutMs: 20,
    verifierTimeoutMs: 20,
    knowledgeClient: { async query() { throw new Error("not requested"); } },
  });
  const shadow = new LangGraphShadowOrchestrator({ legacyAgent: legacy });
  const sessionId = shadow.startSession({ adultConfirmed: true });

  const first = await shadow.handleMessage(sessionId, "我胸痛", { clientTurnId: "real-1" });
  assert.equal(first.question.id, "CHEST_PAIN_BREATHING");
  assert.equal(shadow.getShadowReport(sessionId).comparison.status, "MATCH");

  const second = await shadow.handleMessage(sessionId, "没有", { clientTurnId: "real-2" });
  assert.equal(second.question.id, "CHEST_PAIN_PRESSURE");
  assert.equal(shadow.getShadowReport(sessionId).comparison.status, "MATCH");
  assert.equal(legacy.getSession(sessionId).state.redFlags.difficultyBreathing, false);
  assert.equal((await shadow.getShadowState(sessionId)).traceEvents.length, 8);
});

class SequenceLegacyAgent {
  constructor(turns) {
    this.turns = turns;
    this.index = -1;
    this.sessionId = "shadow-session-1";
    this.current = { state: caseState(), pendingClarification: null, response: null };
    this.lastResponse = null;
  }

  startSession() { return this.sessionId; }
  async resumeSession() { return this.getSession(this.sessionId); }
  getSession() {
    return {
      state: structuredClone(this.current.state),
      pendingClarification: structuredClone(this.current.pendingClarification),
    };
  }
  getHistory() { return []; }
  exportSession() { return JSON.stringify(this.current.state); }
  getAudit() { return []; }
  getDecisionTraces() { return []; }
  async handleMessage() {
    this.index += 1;
    this.current = this.turns[this.index];
    this.lastResponse = structuredClone(this.current.response);
    return this.lastResponse;
  }
}

function turn({ state = caseState(), question }) {
  const pendingClarification = question ? {
    source: "core",
    pathway: "CHEST_PAIN_V1",
    factPath: question.factPath,
    question: { id: question.id, text: question.text },
    reasonCodes: [`MISSING_${question.id}`],
  } : null;
  return {
    state,
    pendingClarification,
    response: {
      action: question ? "ASK_MORE" : "DISPOSITION",
      disposition: question ? null : "URGENT_SAME_DAY",
      riskLevel: question ? "ASK_MORE" : "URGENT_SAME_DAY",
      reasonCodes: question ? [`MISSING_${question.id}`] : ["SAFE_FINAL"],
      question: question ? { id: question.id, text: question.text } : null,
      pendingClarification,
      decisionTraceId: "legacy-trace",
      coreDecisionTraceId: "core-trace",
      semantic: {
        extractionStatus: "completed",
        gateSummary: { ACCEPT: 1, UNCERTAIN: 0, REJECT: 0 },
      },
      knowledgeSupport: { status: "not_requested" },
    },
  };
}

function caseState({ turnCount = 1, facts = {} } = {}) {
  return {
    schemaVersion: "case-state-0.1.0",
    sessionId: "shadow-session-1",
    patientContext: { adultConfirmed: true, age: null, region: "CN", pregnant: null },
    chiefComplaint: { code: "chest_pain", rawLabel: "胸痛" },
    symptoms: {},
    redFlags: Object.fromEntries(Object.entries(facts)
      .filter(([path]) => path.startsWith("redFlags."))
      .map(([path, metadata]) => [path.split(".")[1], metadata.value])),
    relevantHistory: {},
    factMetadata: {
      "patientContext.adultConfirmed": known(true, 0),
      "chiefComplaint.code": known("chest_pain", 1),
      ...facts,
    },
    decisionState: { action: "ASK_MORE", disposition: null, reasonCodes: [] },
    askedQuestionIds: [],
    questionAttempts: {},
    turnCount,
    closed: false,
  };
}

function known(value, updatedAtTurn) {
  return { status: "known", value, values: [value], updatedAtTurn };
}

function breathingQuestion() {
  return {
    id: "CHEST_PAIN_BREATHING",
    factPath: "redFlags.difficultyBreathing",
    text: "胸痛时有没有呼吸困难、喘不上气或明显憋气？",
  };
}

function pressureQuestion() {
  return {
    id: "CHEST_PAIN_PRESSURE",
    factPath: "redFlags.pressureOrCrushing",
    text: "疼痛是否像压榨、重物压住或紧缩感？",
  };
}
