import { randomUUID } from "node:crypto";

import {
  createLangGraphQuestionPlanner,
  LANGGRAPH_QUESTION_PLANNER_VERSION,
  plannerInput,
} from "./langgraph-question-planner.js";
import { resolveAgentOrchestratorMode } from "./orchestrator-mode.js";

export const PLANNER_ORCHESTRATED_LOOP_VERSION =
  "phase-5.2-planner-orchestrated-loop-0.1.0";

export class PlannerOrchestratedLoop {
  #loop;
  #mode;
  #graph;
  #pendingController;
  #reports = new Map();
  #canonicalPending = new Map();

  constructor({ loop, mode = "shadow", graph, pendingController } = {}) {
    assertLoop(loop);
    if (typeof pendingController?.replacePendingQuestion !== "function") {
      throw new TypeError(
        "PlannerOrchestratedLoop requires pendingController.replacePendingQuestion().",
      );
    }
    this.#loop = loop;
    this.#pendingController = pendingController;
    this.#mode = resolveAgentOrchestratorMode(mode);
    if (this.#mode === "legacy") {
      throw new TypeError("PlannerOrchestratedLoop requires shadow or langgraph mode.");
    }
    this.#graph = graph ?? createLangGraphQuestionPlanner().graph;
  }

  startSession(context = {}) {
    const sessionId = this.#loop.startSession(context);
    this.#canonicalPending.delete(sessionId);
    return sessionId;
  }
  restoreSession(serializedState) {
    const sessionId = this.#loop.restoreSession(serializedState);
    this.#canonicalPending.delete(sessionId);
    return sessionId;
  }
  exportSession(sessionId) { return this.#loop.exportSession(sessionId); }
  getAudit(sessionId) { return this.#loop.getAudit(sessionId); }
  getDecisionTraces(sessionId) { return this.#loop.getDecisionTraces(sessionId); }

  getSession(sessionId) {
    const session = this.#loop.getSession(sessionId);
    return {
      plannerOrchestratorVersion: PLANNER_ORCHESTRATED_LOOP_VERSION,
      ...session,
      pendingClarification: this.#canonicalPending.has(sessionId)
        ? structuredClone(this.#canonicalPending.get(sessionId))
        : session.pendingClarification,
      orchestrator: this.#publicReport(sessionId),
    };
  }

  async handleMessage(sessionId, message) {
    const legacyDecision = await this.#loop.handleMessage(sessionId, message);
    const session = this.#loop.getSession(sessionId);
    const riskFingerprint = fingerprintRisk(legacyDecision, session.state);
    const clientTurnId = randomUUID();

    try {
      const state = await this.#graph.invoke(plannerInput({
        sessionId,
        clientTurnId,
        caseState: session.state,
        decision: legacyDecision,
        pendingClarification: session.pendingClarification,
      }), threadConfig(sessionId));
      if (fingerprintRisk(legacyDecision, this.#loop.getSession(sessionId).state)
          !== riskFingerprint) {
        throw orchestratorError("ORCHESTRATOR_RISK_STATE_MUTATION");
      }

      let response = legacyDecision;
      let responseSource = "legacy";
      if (this.#mode === "langgraph" && canApplySelectedQuestion(
        state,
        legacyDecision,
        session.pendingClarification,
      )) {
        const pending = pendingFrom(state.selectedQuestion, session.pendingClarification);
        const canonical = this.#pendingController.replacePendingQuestion(sessionId, pending);
        this.#canonicalPending.set(sessionId, canonical);
        response = withSelectedQuestion(legacyDecision, canonical);
        responseSource = "langgraph_planner";
      } else {
        this.#canonicalPending.set(
          sessionId,
          structuredClone(session.pendingClarification ?? null),
        );
      }

      this.#reports.set(sessionId, {
        version: LANGGRAPH_QUESTION_PLANNER_VERSION,
        mode: this.#mode,
        status: state.plannerStatus,
        responseSource,
        comparison: structuredClone(state.comparison),
        selectedQuestion: structuredClone(state.selectedQuestion),
        fallbackReason: null,
      });
      return {
        ...response,
        orchestrator: this.#publicReport(sessionId),
      };
    } catch (error) {
      this.#canonicalPending.set(
        sessionId,
        structuredClone(session.pendingClarification ?? null),
      );
      this.#reports.set(sessionId, {
        version: LANGGRAPH_QUESTION_PLANNER_VERSION,
        mode: this.#mode,
        status: "fallback",
        responseSource: "legacy",
        comparison: null,
        selectedQuestion: null,
        fallbackReason: error?.code ?? error?.name ?? "LANGGRAPH_PLANNER_ERROR",
      });
      return {
        ...legacyDecision,
        orchestrator: this.#publicReport(sessionId),
      };
    }
  }

  getPlannerReport(sessionId) {
    return this.#publicReport(sessionId);
  }

  async getPlannerState(sessionId) {
    const snapshot = await this.#graph.getState(threadConfig(sessionId));
    return structuredClone(snapshot.values ?? {});
  }

  #publicReport(sessionId) {
    const report = this.#reports.get(sessionId);
    return report ? structuredClone(report) : {
      version: LANGGRAPH_QUESTION_PLANNER_VERSION,
      mode: this.#mode,
      status: "idle",
      responseSource: "legacy",
      comparison: null,
      selectedQuestion: null,
      fallbackReason: null,
    };
  }
}

function canApplySelectedQuestion(state, decision, legacyPending) {
  const safeComparison = state.comparison?.status === "MATCH"
    || (
      state.comparison?.status === "LEGACY_DUPLICATE"
      && state.plannerStatus === "duplicate_replaced"
    );
  return decision?.action === "ASK_MORE"
    && legacyPending?.source !== "semantic"
    && safeComparison
    && state.selectedQuestion?.id
    && state.selectedQuestion?.factPath
    && state.selectedQuestion?.text;
}

function pendingFrom(question, legacyPending) {
  return {
    source: question.source,
    pathway: legacyPending?.pathway ?? null,
    factPath: question.factPath,
    question: { id: question.id, text: question.text },
    reasonCodes: [`MISSING_${question.id}`],
  };
}

function withSelectedQuestion(decision, pending) {
  return {
    ...decision,
    message: pending.question.text,
    question: {
      id: pending.question.id,
      factPath: pending.factPath,
      text: pending.question.text,
    },
    pendingClarification: structuredClone(pending),
  };
}

function threadConfig(sessionId) {
  return { configurable: { thread_id: `phase5-planner:${sessionId}` } };
}

function fingerprintRisk(decision, caseState) {
  return JSON.stringify({
    action: decision?.action ?? null,
    disposition: decision?.disposition ?? null,
    riskLevel: decision?.riskLevel ?? null,
    decisionState: caseState?.decisionState ?? null,
    redFlags: caseState?.redFlags ?? null,
    closed: caseState?.closed ?? null,
  });
}

function assertLoop(loop) {
  for (const method of [
    "startSession",
    "restoreSession",
    "exportSession",
    "getSession",
    "getAudit",
    "getDecisionTraces",
    "handleMessage",
  ]) {
    if (typeof loop?.[method] !== "function") {
      throw new TypeError(`PlannerOrchestratedLoop requires loop.${method}().`);
    }
  }
}

function orchestratorError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
