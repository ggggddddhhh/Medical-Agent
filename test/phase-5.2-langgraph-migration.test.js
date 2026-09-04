import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FactMemory,
  PlannerOrchestratedLoop,
  PlannerPendingBridge,
  createPhase5Agent,
  resolveAgentOrchestratorMode,
} from "../src/index.js";

const offlineFetch = async () => {
  throw new Error("offline Phase 5.2 fixture");
};

test("AGENT_ORCHESTRATOR accepts only legacy, shadow and langgraph", () => {
  for (const mode of ["legacy", "shadow", "langgraph"]) {
    assert.equal(resolveAgentOrchestratorMode(mode), mode);
  }
  assert.throws(
    () => resolveAgentOrchestratorMode("unsafe"),
    { code: "INVALID_AGENT_ORCHESTRATOR_MODE" },
  );
});

test("pending synchronization rejects questions outside the approved Clinical Pathway", () => {
  const bridge = new PlannerPendingBridge();
  const sessionId = bridge.startSession({ adultConfirmed: true });
  bridge.handleRaw(sessionId, "我胸痛");
  assert.throws(() => bridge.replacePendingQuestion(sessionId, {
    source: "clinical_pathway",
    pathway: "CHEST_PAIN_V1",
    factPath: "redFlags.unapproved",
    question: { id: "UNAPPROVED", text: "这是未经批准的问题吗？" },
  }), { code: "UNAPPROVED_PLANNER_QUESTION" });
});

test("Pending Bridge routes a short answer to the canonical replacement question", () => {
  const bridge = new PlannerPendingBridge();
  const sessionId = bridge.startSession({ adultConfirmed: true });
  bridge.handleRaw(sessionId, "我胸痛");
  bridge.applyAcceptedFacts(sessionId, {
    pathway: "CHEST_PAIN_V1",
    facts: [{
      path: "redFlags.difficultyBreathing",
      value: false,
      status: "known",
    }],
    advanceTurn: false,
    evaluate: false,
  });
  const before = bridge.getState(sessionId);

  bridge.replacePendingQuestion(sessionId, pressurePending());
  const synchronized = bridge.getState(sessionId);
  assert.equal(synchronized.decisionState.pendingQuestionId, "CHEST_PAIN_PRESSURE");
  assert.equal(synchronized.decisionState.action, before.decisionState.action);
  assert.equal(synchronized.decisionState.disposition, before.decisionState.disposition);
  assert.deepEqual(synchronized.redFlags, before.redFlags);

  const response = bridge.handleRaw(sessionId, "没有");
  assert.equal(bridge.getState(sessionId).redFlags.pressureOrCrushing, false);
  assert.equal(response.question.id, "CHEST_PAIN_RADIATION");
});

test("planner comparison keeps Shadow observational and lets LangGraph replace only an answered duplicate", async () => {
  const shadowLoop = new DuplicateLoop();
  const shadow = new PlannerOrchestratedLoop({
    loop: shadowLoop,
    mode: "shadow",
    pendingController: shadowLoop,
  });
  const shadowId = shadow.startSession();
  const shadowResponse = await shadow.handleMessage(shadowId, "继续");

  assert.equal(shadowResponse.question.id, "CHEST_PAIN_BREATHING");
  assert.equal(shadowResponse.orchestrator.comparison.status, "LEGACY_DUPLICATE");
  assert.equal(shadowResponse.orchestrator.responseSource, "legacy");
  assert.equal(shadowLoop.getSession(shadowId).pendingClarification.question.id,
    "CHEST_PAIN_BREATHING");

  const activeLoop = new DuplicateLoop();
  const active = new PlannerOrchestratedLoop({
    loop: activeLoop,
    mode: "langgraph",
    pendingController: activeLoop,
  });
  const activeId = active.startSession();
  const activeResponse = await active.handleMessage(activeId, "继续");

  assert.equal(activeResponse.action, shadowResponse.action);
  assert.equal(activeResponse.disposition, shadowResponse.disposition);
  assert.equal(activeResponse.question.id, "CHEST_PAIN_PRESSURE");
  assert.equal(activeResponse.pendingClarification.factPath, "redFlags.pressureOrCrushing");
  assert.equal(activeResponse.pendingClarification.source, "clinical_pathway");
  assert.equal(activeResponse.orchestrator.status, "duplicate_replaced");
  assert.equal(activeResponse.orchestrator.responseSource, "langgraph_planner");
  assert.equal(activeLoop.getSession(activeId).pendingClarification.question.id,
    "CHEST_PAIN_PRESSURE");
});

test("duplicate question benchmark reduces answered-field repeats from 40/40 to 0/40", async () => {
  const loop = new DuplicateLoop();
  const active = new PlannerOrchestratedLoop({
    loop,
    mode: "langgraph",
    pendingController: loop,
  });
  let legacyDuplicates = 0;
  let langGraphDuplicates = 0;

  for (let index = 0; index < 40; index += 1) {
    const sessionId = active.startSession({ sessionId: `benchmark-${index}` });
    const answered = new FactMemory().snapshot(loop.getSession(sessionId).state)
      .answeredFactPaths;
    const legacyQuestion = loop.peekDecision(sessionId).question;
    if (answered.includes(legacyQuestion.factPath)) legacyDuplicates += 1;

    const response = await active.handleMessage(sessionId, "继续");
    if (answered.includes(response.question.factPath)) langGraphDuplicates += 1;
  }

  assert.equal(legacyDuplicates, 40);
  assert.equal(langGraphDuplicates, 0);
});

test("LangGraph planner failure falls back to the byte-equivalent Legacy clinical decision", async () => {
  const loop = new DuplicateLoop();
  const failure = new Error("checkpointer unavailable");
  failure.code = "PLANNER_CHECKPOINTER_UNAVAILABLE";
  const active = new PlannerOrchestratedLoop({
    loop,
    mode: "langgraph",
    pendingController: loop,
    graph: {
      async invoke() { throw failure; },
      async getState() { return { values: {} }; },
    },
  });
  const sessionId = active.startSession();
  const expected = loop.peekDecision(sessionId);
  const response = await active.handleMessage(sessionId, "继续");

  for (const field of ["action", "disposition", "message", "question", "reasonCodes"]) {
    assert.deepEqual(response[field], expected[field]);
  }
  assert.equal(response.orchestrator.status, "fallback");
  assert.equal(response.orchestrator.responseSource, "legacy");
  assert.equal(response.orchestrator.fallbackReason, "PLANNER_CHECKPOINTER_UNAVAILABLE");
});

test("Semantic Gate clarification remains Legacy-owned in langgraph mode", async () => {
  const loop = new DuplicateLoop({ sessionFactory: semanticPendingSession });
  const active = new PlannerOrchestratedLoop({
    loop,
    mode: "langgraph",
    pendingController: loop,
  });
  const sessionId = active.startSession();
  const response = await active.handleMessage(sessionId, "是我还是朋友不确定");

  assert.equal(response.pendingClarification.source, "semantic");
  assert.equal(response.pendingClarification.question.id, "SEMANTIC_SUBJECT_CONFIRMATION");
  assert.equal(response.orchestrator.comparison.status, "MATCH");
  assert.equal(response.orchestrator.responseSource, "legacy");
  assert.equal(loop.getSession(sessionId).pendingClarification.source, "semantic");
});

test("Legacy and LangGraph modes keep real risk decisions and high-risk facts consistent", async (t) => {
  const legacyDirectory = temporaryDirectory(t, "legacy");
  const graphDirectory = temporaryDirectory(t, "langgraph");
  const options = {
    fetchImpl: offlineFetch,
    extractionTimeoutMs: 20,
    verifierTimeoutMs: 20,
    knowledgeClient: { async query() { throw new Error("not requested"); } },
  };
  const legacy = createPhase5Agent({
    ...options,
    memoryStorageDir: legacyDirectory,
    orchestratorMode: "legacy",
  });
  const langgraph = createPhase5Agent({
    ...options,
    memoryStorageDir: graphDirectory,
    orchestratorMode: "langgraph",
  });
  const legacyId = legacy.startSession({ adultConfirmed: true });
  const graphId = langgraph.startSession({ adultConfirmed: true });

  const legacyResponse = await legacy.handleMessage(legacyId, "我胸痛而且喘不上来");
  const graphResponse = await langgraph.handleMessage(graphId, "我胸痛而且喘不上来");
  const legacyState = legacy.getSession(legacyId).state;
  const graphState = langgraph.getSession(graphId).state;

  assert.equal(graphResponse.action, legacyResponse.action);
  assert.equal(graphResponse.disposition, legacyResponse.disposition);
  assert.equal(graphResponse.riskLevel, legacyResponse.riskLevel);
  assert.deepEqual(graphResponse.reasonCodes, legacyResponse.reasonCodes);
  assert.deepEqual(graphState.redFlags, legacyState.redFlags);
  assert.deepEqual(graphState.decisionState, legacyState.decisionState);
  assert.equal(graphResponse.orchestrator.mode, "langgraph");
  assert.equal(graphResponse.orchestrator.responseSource, "legacy");
});

test("normal real-agent questions remain consistent across all three modes", async (t) => {
  const responses = [];
  for (const mode of ["legacy", "shadow", "langgraph"]) {
    const agent = createPhase5Agent({
      orchestratorMode: mode,
      memoryStorageDir: temporaryDirectory(t, mode),
      fetchImpl: offlineFetch,
      extractionTimeoutMs: 20,
      verifierTimeoutMs: 20,
      knowledgeClient: { async query() { throw new Error("not requested"); } },
    });
    const sessionId = agent.startSession({ adultConfirmed: true });
    responses.push(await agent.handleMessage(sessionId, "我胸痛"));
  }

  assert.equal(responses[0].question.id, "CHEST_PAIN_BREATHING");
  assert.equal(responses[1].question.id, responses[0].question.id);
  assert.equal(responses[2].question.id, responses[0].question.id);
  assert.equal(responses[0].orchestrator, undefined);
  assert.equal(responses[1].orchestrator.mode, "shadow");
  assert.equal(responses[2].orchestrator.mode, "langgraph");
  assert.equal(responses[2].orchestrator.comparison.status, "MATCH");
  assert.equal(responses[2].orchestrator.responseSource, "langgraph_planner");
});

test("the approved adult-scope question can be canonicalized without changing its content", async (t) => {
  const agent = createPhase5Agent({
    orchestratorMode: "langgraph",
    memoryStorageDir: temporaryDirectory(t, "adult"),
    fetchImpl: offlineFetch,
    extractionTimeoutMs: 20,
    verifierTimeoutMs: 20,
    knowledgeClient: { async query() { throw new Error("not requested"); } },
  });
  const sessionId = agent.startSession();
  const response = await agent.handleMessage(sessionId, "我胸痛");

  assert.equal(response.question.id, "CONFIRM_ADULT");
  assert.equal(response.pendingClarification.factPath, "patientContext.adultConfirmed");
  assert.equal(response.orchestrator.responseSource, "langgraph_planner");
});

test("langgraph mode restores the canonical pending question across process restart", async (t) => {
  const directory = temporaryDirectory(t, "restore");
  const options = {
    orchestratorMode: "langgraph",
    memoryStorageDir: directory,
    fetchImpl: offlineFetch,
    extractionTimeoutMs: 20,
    verifierTimeoutMs: 20,
    knowledgeClient: { async query() { throw new Error("not requested"); } },
  };
  const firstProcess = createPhase5Agent(options);
  const sessionId = firstProcess.startSession({ adultConfirmed: true });
  const first = await firstProcess.handleMessage(sessionId, "我胸痛");
  assert.equal(first.pendingClarification.question.id, "CHEST_PAIN_BREATHING");

  const secondProcess = createPhase5Agent(options);
  const restored = await secondProcess.resumeSession(sessionId);
  assert.equal(restored.pendingClarification.question.id, "CHEST_PAIN_BREATHING");
  assert.equal(restored.orchestrator.mode, "langgraph");

  const second = await secondProcess.handleMessage(sessionId, "没有");
  assert.equal(second.question.id, "CHEST_PAIN_PRESSURE");
  assert.equal(secondProcess.getSession(sessionId).state.redFlags.difficultyBreathing, false);
});

test("Phase 5.2 documentation records modes, fallback, impact and test plan", async () => {
  const document = await readFile(
    new URL("../docs/phase-5.2-langgraph-progressive-migration.md", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ));
  for (const marker of [
    "AGENT_ORCHESTRATOR=legacy",
    "shadow",
    "langgraph",
    "Legacy fallback",
    "影响文件",
    "测试方案",
    "Safety Core",
    "Semantic Gate",
  ]) assert.match(document, new RegExp(marker));
  assert.equal(packageJson.dependencies["@langchain/langgraph"], "1.4.13");
});

class DuplicateLoop {
  constructor({ sessionFactory = duplicateSession } = {}) {
    this.sessions = new Map();
    this.sequence = 0;
    this.sessionFactory = sessionFactory;
  }

  startSession(context = {}) {
    this.sequence += 1;
    const sessionId = context.sessionId ?? `duplicate-${this.sequence}`;
    this.sessions.set(sessionId, this.sessionFactory(sessionId));
    return sessionId;
  }

  restoreSession(serializedState) {
    const state = JSON.parse(serializedState);
    this.sessions.set(state.sessionId, this.sessionFactory(state.sessionId, state));
    return state.sessionId;
  }

  exportSession(sessionId) { return JSON.stringify(this.#session(sessionId).state); }
  getAudit() { return []; }
  getDecisionTraces() { return []; }
  getSession(sessionId) { return structuredClone(this.#session(sessionId)); }
  peekDecision(sessionId) { return structuredClone(this.#session(sessionId).decision); }
  async handleMessage(sessionId) { return this.peekDecision(sessionId); }

  replacePendingQuestion(sessionId, pending) {
    this.#session(sessionId).pendingClarification = structuredClone(pending);
    return structuredClone(pending);
  }

  #session(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown fixture session: ${sessionId}`);
    return session;
  }
}

function duplicateSession(sessionId, restoredState = null) {
  const state = restoredState ?? caseState(sessionId);
  const pendingClarification = breathingPending();
  return {
    state,
    pendingClarification,
    decision: {
      sessionId,
      action: "ASK_MORE",
      disposition: null,
      reasonCodes: ["MISSING_CHEST_PAIN_BREATHING"],
      message: pendingClarification.question.text,
      question: {
        ...pendingClarification.question,
        factPath: pendingClarification.factPath,
      },
      pendingClarification,
      semantic: {
        extractionStatus: "completed",
        gateSummary: { ACCEPT: 1, UNCERTAIN: 0, REJECT: 0 },
      },
    },
  };
}

function semanticPendingSession(sessionId, restoredState = null) {
  const state = restoredState ?? caseState(sessionId);
  delete state.factMetadata["redFlags.difficultyBreathing"];
  delete state.redFlags.difficultyBreathing;
  const pendingClarification = {
    source: "semantic",
    pathway: "CHEST_PAIN_V1",
    factPath: "redFlags.difficultyBreathing",
    question: {
      id: "SEMANTIC_SUBJECT_CONFIRMATION",
      text: "请确认，胸痛的是您本人还是您的朋友？",
    },
    reasonCodes: ["SUBJECT_UNCERTAIN"],
  };
  return {
    state,
    pendingClarification,
    decision: {
      sessionId,
      action: "ASK_MORE",
      disposition: null,
      reasonCodes: ["SEMANTIC_CLARIFICATION_REQUIRED", "SUBJECT_UNCERTAIN"],
      message: pendingClarification.question.text,
      question: {
        ...pendingClarification.question,
        factPath: pendingClarification.factPath,
      },
      pendingClarification,
      semantic: {
        extractionStatus: "completed",
        gateSummary: { ACCEPT: 0, UNCERTAIN: 1, REJECT: 0 },
      },
    },
  };
}

function caseState(sessionId) {
  return {
    schemaVersion: "case-state-0.1.0",
    sessionId,
    patientContext: { adultConfirmed: true, age: null, region: "CN", pregnant: null },
    chiefComplaint: { code: "chest_pain", rawLabel: "胸痛" },
    symptoms: {},
    redFlags: { difficultyBreathing: false },
    relevantHistory: {},
    factMetadata: {
      "patientContext.adultConfirmed": known(true, 0),
      "chiefComplaint.code": known("chest_pain", 1),
      "redFlags.difficultyBreathing": known(false, 2),
    },
    decisionState: {
      action: "ASK_MORE",
      disposition: null,
      reasonCodes: ["MISSING_CHEST_PAIN_BREATHING"],
      pathwayVersion: "CHEST_PAIN_V1@1.0.0",
      pendingQuestionId: "CHEST_PAIN_BREATHING",
    },
    askedQuestionIds: ["CHEST_PAIN_BREATHING"],
    questionAttempts: { CHEST_PAIN_BREATHING: 1 },
    turnCount: 2,
    closed: false,
  };
}

function breathingPending() {
  return {
    source: "core",
    pathway: "CHEST_PAIN_V1",
    factPath: "redFlags.difficultyBreathing",
    question: {
      id: "CHEST_PAIN_BREATHING",
      text: "胸痛时有没有呼吸困难、喘不上气或明显憋气？",
    },
    reasonCodes: ["MISSING_CHEST_PAIN_BREATHING"],
  };
}

function pressurePending() {
  return {
    source: "clinical_pathway",
    pathway: "CHEST_PAIN_V1",
    factPath: "redFlags.pressureOrCrushing",
    question: {
      id: "CHEST_PAIN_PRESSURE",
      text: "疼痛是否像压榨、重物压住或紧缩感？",
    },
    reasonCodes: ["MISSING_CHEST_PAIN_PRESSURE"],
  };
}

function known(value, updatedAtTurn) {
  return { status: "known", value, values: [value], updatedAtTurn };
}

function temporaryDirectory(t, suffix) {
  const directory = mkdtempSync(join(tmpdir(), `medical-agent-phase52-${suffix}-`));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
