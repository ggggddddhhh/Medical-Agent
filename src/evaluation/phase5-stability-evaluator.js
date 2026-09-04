import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DUPLICATE_BENCHMARK_CASES,
  PHASE_53_STABILITY_DATASET_VERSION,
  SAFETY_REGRESSION_CASES,
  SESSION_RESUME_CASES,
  UNSUPPORTED_BOUNDARY_CASES,
} from "../../evaluation/phase-5.3-stability-cases.js";
import { createPhase5Agent } from "../phase5/create-phase5-agent.js";
import { FactMemory } from "../phase5/fact-memory.js";
import { createLangGraphQuestionPlanner } from "../phase5/langgraph-question-planner.js";
import { PlannerOrchestratedLoop } from "../phase5/planner-orchestrated-loop.js";
import { QuestionPlanner } from "../phase5/question-planner.js";
import { FileSessionManager } from "../phase5/session-manager.js";

export const PHASE_53_STABILITY_EVALUATOR_VERSION =
  "phase-5.3-stability-evaluator-0.1.0";

const offlineFetch = async () => {
  throw new Error("Phase 5.3 deterministic offline evaluation");
};

const unavailableKnowledge = {
  async query() { throw new Error("Knowledge service intentionally unavailable"); },
};

export async function evaluatePhase53Stability() {
  const root = mkdtempSync(join(tmpdir(), "medical-agent-phase53-"));
  try {
    const duplicateQuestionBenchmark = await evaluateDuplicateQuestions(root);
    const sessionResumeStability = await evaluateSessionResume(root);
    const safetyRegression = await evaluateSafetyRegression(root);
    const failureFallback = await evaluateFailureFallback(root);
    const factMemoryConsistency = evaluateFactMemoryConsistency();
    const passed = duplicateQuestionBenchmark.langgraph.duplicateQuestionRate === 0
      && duplicateQuestionBenchmark.questionDrift.rate === 0
      && sessionResumeStability.passed === sessionResumeStability.total
      && safetyRegression.riskDrift === 0
      && safetyRegression.dispositionDrift === 0
      && failureFallback.passed === failureFallback.total
      && factMemoryConsistency.passed === factMemoryConsistency.total;

    return {
      evaluatorVersion: PHASE_53_STABILITY_EVALUATOR_VERSION,
      datasetVersion: PHASE_53_STABILITY_DATASET_VERSION,
      validationVerdict: passed ? "PASS_WITH_CONDITIONS" : "FAIL",
      defaultRecommendation: "KEEP_LEGACY_DEFAULT",
      duplicateQuestionBenchmark,
      sessionResumeStability,
      safetyRegression,
      failureFallback,
      factMemoryConsistency,
      conditions: passed ? [
        "Only headache and chest-pain Clinical Pathways exercise active planning.",
        "Fever, cough and abdominal pain are verified only as unsupported safety boundaries.",
        "No concurrency, load or long-running real-model soak test is included.",
      ] : ["One or more required stability gates failed."],
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function evaluateDuplicateQuestions(root) {
  let legacyDuplicateCount = 0;
  let langgraphDuplicateCount = 0;
  let duplicateEmissions = 0;
  let intentionalCorrections = 0;
  let questionDriftCount = 0;
  let questionDriftDenominator = 0;

  for (const item of DUPLICATE_BENCHMARK_CASES) {
    const legacyLoop = new BenchmarkLoop(item);
    const legacyId = legacyLoop.startSession();
    const legacyResponse = await legacyLoop.handleMessage(legacyId, "继续");
    const answeredPaths = new FactMemory().snapshot(
      legacyLoop.getSession(legacyId).state,
    ).answeredFactPaths;

    const graphLoop = new BenchmarkLoop(item);
    const graph = new PlannerOrchestratedLoop({
      loop: graphLoop,
      mode: "langgraph",
      pendingController: graphLoop,
    });
    const graphId = graph.startSession();
    const graphResponse = await graph.handleMessage(graphId, "继续");

    if (item.answered) {
      duplicateEmissions += 1;
      if (answeredPaths.includes(legacyResponse.question.factPath)) {
        legacyDuplicateCount += 1;
      }
      if (answeredPaths.includes(graphResponse.question.factPath)) {
        langgraphDuplicateCount += 1;
      }
      if (graphResponse.orchestrator.comparison.status === "LEGACY_DUPLICATE"
          && graphResponse.orchestrator.responseSource === "langgraph_planner") {
        intentionalCorrections += 1;
      }
    } else {
      questionDriftDenominator += 1;
      if (legacyResponse.question.id !== graphResponse.question.id) {
        questionDriftCount += 1;
      }
    }
  }

  let unsupportedConsistent = 0;
  for (const item of UNSUPPORTED_BOUNDARY_CASES) {
    const responses = [];
    for (const mode of ["legacy", "langgraph"]) {
      const agent = makeAgent({
        root,
        directoryName: `boundary-${item.id}-${mode}`,
        orchestratorMode: mode,
      });
      const sessionId = agent.startSession({ adultConfirmed: true });
      responses.push(await agent.handleMessage(sessionId, item.message));
    }
    questionDriftDenominator += 1;
    if (clinicalProjection(responses[0]) !== clinicalProjection(responses[1])) {
      questionDriftCount += 1;
    } else if (
      responses.every((response) => response.action === "OUT_OF_SCOPE" && !response.question)
    ) {
      unsupportedConsistent += 1;
    }
  }

  return {
    totalCases: DUPLICATE_BENCHMARK_CASES.length + UNSUPPORTED_BOUNDARY_CASES.length,
    coverage: ["headache", "chest_pain", "fever", "cough", "abdominal_pain"],
    activePlannerPathways: ["headache", "chest_pain"],
    unsupportedBoundaryPathways: ["fever", "cough", "abdominal_pain"],
    duplicateChallengeCases: duplicateEmissions,
    legacy: rate(legacyDuplicateCount, duplicateEmissions, "duplicateQuestionRate"),
    langgraph: rate(langgraphDuplicateCount, duplicateEmissions, "duplicateQuestionRate"),
    intentionalDuplicateCorrections: intentionalCorrections,
    questionDrift: rate(questionDriftCount, questionDriftDenominator, "rate"),
    unsupportedBoundaryConsistency: {
      passed: unsupportedConsistent,
      total: UNSUPPORTED_BOUNDARY_CASES.length,
    },
  };
}

async function evaluateSessionResume(root) {
  const fieldPasses = Object.fromEntries([
    "sessionId",
    "caseState",
    "factMemory",
    "pendingQuestion",
    "questionLedger",
  ].map((field) => [field, 0]));
  const cases = [];

  for (const item of SESSION_RESUME_CASES) {
    const directory = join(root, item.id);
    const firstManager = new FileSessionManager({ directory });
    const first = makeAgent({ root, directory, sessionManager: firstManager });
    const sessionId = first.startSession({ adultConfirmed: true });
    const initial = await first.handleMessage(sessionId, item.initialMessage);
    const before = firstManager.load(sessionId);

    const secondManager = new FileSessionManager({ directory });
    const second = makeAgent({ root, directory, sessionManager: secondManager });
    const restored = await second.resumeSession(sessionId);
    const after = secondManager.load(sessionId);
    const checks = {
      sessionId: restored.state.sessionId === before.sessionId
        && after.sessionId === before.sessionId,
      caseState: equal(after.caseState, before.caseState)
        && equal(restored.state, before.caseState),
      factMemory: equal(after.factMemory, before.factMemory),
      pendingQuestion: equal(after.pendingClarification, before.pendingClarification)
        && equal(restored.pendingClarification, before.pendingClarification),
      questionLedger: equal(
        after.questionMemory.questions,
        before.questionMemory.questions,
      ),
    };
    for (const [field, passed] of Object.entries(checks)) {
      if (passed) fieldPasses[field] += 1;
    }
    const continued = await second.handleMessage(sessionId, item.answer);
    const passed = Object.values(checks).every(Boolean)
      && initial.question?.id === item.expectedFirstQuestionId
      && continued.question?.id === item.expectedNextQuestionId;
    cases.push({
      id: item.id,
      passed,
      restoredFields: checks,
      firstQuestionId: initial.question?.id ?? null,
      nextQuestionId: continued.question?.id ?? null,
    });
  }

  return {
    passed: cases.filter((item) => item.passed).length,
    total: cases.length,
    fieldPasses,
    cases,
  };
}

async function evaluateSafetyRegression(root) {
  const cases = [];
  let riskDrift = 0;
  let dispositionDrift = 0;
  for (const item of SAFETY_REGRESSION_CASES) {
    const legacy = makeAgent({
      root,
      directoryName: `safety-${item.id}-legacy`,
      orchestratorMode: "legacy",
    });
    const langgraph = makeAgent({
      root,
      directoryName: `safety-${item.id}-langgraph`,
      orchestratorMode: "langgraph",
    });
    const legacyFinal = await runConversation(legacy, item);
    const graphFinal = await runConversation(langgraph, item);
    if (legacyFinal.riskLevel !== graphFinal.riskLevel) riskDrift += 1;
    if (legacyFinal.disposition !== graphFinal.disposition) dispositionDrift += 1;
    cases.push({
      id: item.id,
      legacyRiskLevel: legacyFinal.riskLevel,
      langgraphRiskLevel: graphFinal.riskLevel,
      legacyDisposition: legacyFinal.disposition,
      langgraphDisposition: graphFinal.disposition,
      expectedMatched: graphFinal.riskLevel === item.expectedRiskLevel
        && graphFinal.disposition === item.expectedDisposition,
    });
  }
  return { total: cases.length, riskDrift, dispositionDrift, cases };
}

async function evaluateFailureFallback(root) {
  const failures = [
    ["graph-exception", failingGraph("LANGGRAPH_EXECUTION_FAILED")],
    ["checkpoint-failure", failingGraph("PLANNER_CHECKPOINT_FAILED")],
    ["planner-failure", createLangGraphQuestionPlanner({
      questionPlanner: {
        plan() {
          const error = new Error("planner failed");
          error.code = "QUESTION_PLANNER_FAILED";
          throw error;
        },
      },
    }).graph],
  ];
  const cases = [];
  for (const [id, plannerGraph] of failures) {
    const legacy = makeAgent({
      root,
      directoryName: `failure-${id}-legacy`,
      orchestratorMode: "legacy",
    });
    const graph = makeAgent({
      root,
      directoryName: `failure-${id}-graph`,
      orchestratorMode: "langgraph",
      plannerGraph,
    });
    const legacyId = legacy.startSession({ adultConfirmed: true });
    const graphId = graph.startSession({ adultConfirmed: true });
    const message = "胸口像石头压着一样，喘不上来气";
    const expected = await legacy.handleMessage(legacyId, message);
    const actual = await graph.handleMessage(graphId, message);
    cases.push({
      id,
      passed: clinicalProjection(expected) === clinicalProjection(actual)
        && actual.orchestrator?.status === "fallback"
        && actual.orchestrator?.responseSource === "legacy",
      fallbackReason: actual.orchestrator?.fallbackReason ?? null,
      riskLevel: actual.riskLevel,
      disposition: actual.disposition,
    });
  }
  return {
    passed: cases.filter((item) => item.passed).length,
    total: cases.length,
    cases,
  };
}

function evaluateFactMemoryConsistency() {
  const cases = [];
  for (const complaint of ["headache", "chest_pain"]) {
    const definition = questionDefinition(complaint);
    for (const status of ["known", "unknown", "conflicting"]) {
      const state = benchmarkState(`fact-${complaint}-${status}`, complaint, false);
      state.factMetadata[definition.first.factPath] = metadataFor(status);
      const factMemory = new FactMemory().snapshot(state);
      const planned = new QuestionPlanner().plan({
        caseState: state,
        factMemory,
        pendingClarification: pendingFor(definition.first, definition.pathway),
      });
      const expectedQuestionId = status === "known"
        ? definition.second.id
        : definition.first.id;
      cases.push({
        id: `${complaint}-${status}`,
        status,
        expectedQuestionId,
        actualQuestionId: planned?.id ?? null,
        passed: planned?.id === expectedQuestionId,
      });
    }
  }
  return {
    passed: cases.filter((item) => item.passed).length,
    total: cases.length,
    cases,
  };
}

class BenchmarkLoop {
  constructor(definition) {
    this.definition = definition;
    this.sessions = new Map();
    this.sequence = 0;
  }

  startSession() {
    this.sequence += 1;
    const sessionId = `benchmark-${this.definition.id}-${this.sequence}`;
    const questions = questionDefinition(this.definition.complaint);
    const state = benchmarkState(
      sessionId,
      this.definition.complaint,
      this.definition.answered,
    );
    const pending = pendingFor(questions.first, questions.pathway);
    this.sessions.set(sessionId, {
      state,
      pendingClarification: pending,
      response: benchmarkResponse(sessionId, pending),
    });
    return sessionId;
  }

  restoreSession(serializedState) {
    const state = JSON.parse(serializedState);
    const sessionId = state.sessionId;
    const questions = questionDefinition(this.definition.complaint);
    const pending = pendingFor(questions.first, questions.pathway);
    this.sessions.set(sessionId, {
      state,
      pendingClarification: pending,
      response: benchmarkResponse(sessionId, pending),
    });
    return sessionId;
  }

  exportSession(sessionId) { return JSON.stringify(this.#session(sessionId).state); }
  getAudit() { return []; }
  getDecisionTraces() { return []; }
  getSession(sessionId) { return structuredClone(this.#session(sessionId)); }
  async handleMessage(sessionId) { return structuredClone(this.#session(sessionId).response); }

  replacePendingQuestion(sessionId, pending) {
    this.#session(sessionId).pendingClarification = structuredClone(pending);
    return structuredClone(pending);
  }

  #session(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown benchmark session: ${sessionId}`);
    return session;
  }
}

function benchmarkState(sessionId, complaint, answered) {
  const definition = questionDefinition(complaint);
  const factMetadata = {
    "patientContext.adultConfirmed": metadataFor("known", true),
    "chiefComplaint.code": metadataFor("known", complaint),
  };
  if (answered) factMetadata[definition.first.factPath] = metadataFor("known", false);
  return {
    schemaVersion: "case-state-0.1.0",
    sessionId,
    patientContext: { adultConfirmed: true, age: null, region: "CN", pregnant: null },
    chiefComplaint: { code: complaint, rawLabel: complaint },
    symptoms: complaint === "headache" && answered ? { onsetPattern: "gradual" } : {},
    redFlags: complaint === "chest_pain" && answered ? { difficultyBreathing: false } : {},
    relevantHistory: {},
    factMetadata,
    decisionState: {
      action: "ASK_MORE",
      disposition: null,
      reasonCodes: [`MISSING_${definition.first.id}`],
      pathwayVersion: `${definition.pathway}@1.0.0`,
      pendingQuestionId: definition.first.id,
    },
    askedQuestionIds: [definition.first.id],
    questionAttempts: { [definition.first.id]: 1 },
    turnCount: 2,
    closed: false,
  };
}

function benchmarkResponse(sessionId, pending) {
  return {
    sessionId,
    action: "ASK_MORE",
    disposition: null,
    riskLevel: "NEEDS_MORE_INFORMATION",
    reasonCodes: [...pending.reasonCodes],
    message: pending.question.text,
    question: { ...pending.question, factPath: pending.factPath },
    pendingClarification: pending,
  };
}

function questionDefinition(complaint) {
  if (complaint === "headache") {
    return {
      pathway: "HEADACHE_V1",
      first: {
        id: "HEADACHE_ONSET",
        factPath: "symptoms.onsetPattern",
        text: "这个头痛是突然在几秒到几分钟内达到最严重程度，还是逐渐出现的？",
      },
      second: {
        id: "HEADACHE_NEURO",
        factPath: "redFlags.neurologicalDeficit",
        text: "有没有同时出现一侧肢体无力或麻木、嘴歪、说话不清、视物异常？",
      },
    };
  }
  return {
    pathway: "CHEST_PAIN_V1",
    first: {
      id: "CHEST_PAIN_BREATHING",
      factPath: "redFlags.difficultyBreathing",
      text: "胸痛时有没有呼吸困难、喘不上气或明显憋气？",
    },
    second: {
      id: "CHEST_PAIN_PRESSURE",
      factPath: "redFlags.pressureOrCrushing",
      text: "疼痛是否像压榨、重物压住或紧缩感？",
    },
  };
}

function pendingFor(question, pathway) {
  return {
    source: "clinical_pathway",
    pathway,
    factPath: question.factPath,
    question: { id: question.id, text: question.text },
    reasonCodes: [`MISSING_${question.id}`],
  };
}

function metadataFor(status, value = null) {
  if (status === "known") {
    return { status, value, values: [value], updatedAtTurn: 2 };
  }
  if (status === "conflicting") {
    return { status, value: null, values: [true, false], updatedAtTurn: 2 };
  }
  return { status, value: null, values: [], updatedAtTurn: 2 };
}

function makeAgent({
  root,
  directory,
  directoryName,
  sessionManager,
  orchestratorMode = "langgraph",
  plannerGraph,
}) {
  return createPhase5Agent({
    orchestratorMode,
    plannerGraph,
    sessionManager,
    memoryStorageDir: directory ?? join(root, directoryName ?? "agent"),
    fetchImpl: offlineFetch,
    extractionTimeoutMs: 20,
    verifierTimeoutMs: 20,
    knowledgeClient: unavailableKnowledge,
  });
}

async function runConversation(agent, definition) {
  const sessionId = agent.startSession(definition.context);
  let response;
  for (const message of definition.messages) {
    response = await agent.handleMessage(sessionId, message);
  }
  return response;
}

function failingGraph(code) {
  return {
    async invoke() {
      const error = new Error(code);
      error.code = code;
      throw error;
    },
    async getState() { return { values: {} }; },
  };
}

function clinicalProjection(response) {
  return JSON.stringify({
    action: response?.action ?? null,
    disposition: response?.disposition ?? null,
    riskLevel: response?.riskLevel ?? null,
    reasonCodes: response?.reasonCodes ?? [],
    question: response?.question ?? null,
  });
}

function rate(count, total, field) {
  return {
    count,
    total,
    [field]: total === 0 ? 0 : count / total,
  };
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
