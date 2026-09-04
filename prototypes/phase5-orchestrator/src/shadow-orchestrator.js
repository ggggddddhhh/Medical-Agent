import { createHash, randomUUID } from "node:crypto";

import { createPhase51ShadowGraph } from "./shadow-graph.js";
import { PHASE_51_GRAPH_STATE_VERSION } from "./state-schema.js";

export const PHASE_51_SHADOW_VERSION = "phase-5.1-langgraph-shadow-0.1.0";

export class LangGraphShadowOrchestrator {
  #legacy;
  #graph;
  #reports = new Map();

  constructor({ legacyAgent, graph } = {}) {
    assertLegacyAgent(legacyAgent);
    this.#legacy = legacyAgent;
    this.#graph = graph ?? createPhase51ShadowGraph().graph;
  }

  startSession(context = {}) { return this.#legacy.startSession(context); }
  resumeSession(sessionId) { return this.#legacy.resumeSession(sessionId); }
  getSession(sessionId) { return this.#legacy.getSession(sessionId); }
  getHistory(sessionId) { return this.#legacy.getHistory(sessionId); }
  exportSession(sessionId) { return this.#legacy.exportSession(sessionId); }
  getAudit(sessionId) { return this.#legacy.getAudit(sessionId); }
  getDecisionTraces(sessionId) { return this.#legacy.getDecisionTraces(sessionId); }

  async handleMessage(sessionId, message, { clientTurnId = randomUUID() } = {}) {
    const legacyResponse = await this.#legacy.handleMessage(sessionId, message);
    const session = this.#legacy.getSession(sessionId);
    const clinicalFingerprint = fingerprint(session.state);
    const config = threadConfig(sessionId);

    try {
      const state = await this.#graph.invoke({
        schemaVersion: PHASE_51_GRAPH_STATE_VERSION,
        sessionId,
        clientTurnId,
        messageDigest: digest(message),
        caseState: structuredClone(session.state),
        legacyResponse: safeResponseProjection(legacyResponse),
        pendingClarification: structuredClone(
          session.pendingClarification ?? legacyResponse.pendingClarification ?? null,
        ),
      }, config);
      if (fingerprint(this.#legacy.getSession(sessionId).state) !== clinicalFingerprint) {
        throw shadowError("SHADOW_MUTATED_LEGACY_CASE_STATE");
      }
      this.#reports.set(sessionId, Object.freeze({
        version: PHASE_51_SHADOW_VERSION,
        mode: "shadow",
        clientTurnId,
        responseSource: "legacy",
        status: state.shadowStatus,
        comparison: structuredClone(state.comparison),
        plannedQuestion: structuredClone(state.plannedQuestion),
        factMemory: structuredClone(state.factMemory),
      }));
    } catch (error) {
      this.#reports.set(sessionId, Object.freeze({
        version: PHASE_51_SHADOW_VERSION,
        mode: "shadow",
        clientTurnId,
        responseSource: "legacy",
        status: "shadow_error",
        errorCode: error?.code ?? error?.name ?? "SHADOW_EXECUTION_ERROR",
      }));
    }

    return legacyResponse;
  }

  getShadowReport(sessionId) {
    const report = this.#reports.get(sessionId);
    return report ? structuredClone(report) : null;
  }

  async getShadowState(sessionId) {
    const snapshot = await this.#graph.getState(threadConfig(sessionId));
    return structuredClone(snapshot.values ?? {});
  }
}

function threadConfig(sessionId) {
  return { configurable: { thread_id: `phase5-shadow:${sessionId}` } };
}

function safeResponseProjection(response) {
  return structuredClone({
    action: response?.action ?? null,
    disposition: response?.disposition ?? null,
    riskLevel: response?.riskLevel ?? null,
    reasonCodes: [...(response?.reasonCodes ?? [])],
    question: response?.question ? {
      id: response.question.id,
      factPath: response.question.factPath ?? null,
    } : null,
    decisionTraceId: response?.decisionTraceId ?? null,
    coreDecisionTraceId: response?.coreDecisionTraceId ?? null,
    semantic: response?.semantic ? {
      extractionStatus: response.semantic.extractionStatus,
      gateSummary: structuredClone(response.semantic.gateSummary),
    } : null,
    knowledgeStatus: response?.knowledgeSupport?.status ?? null,
  });
}

function digest(message) {
  return createHash("sha256").update(String(message), "utf8").digest("hex");
}

function fingerprint(value) {
  return JSON.stringify(value);
}

function assertLegacyAgent(agent) {
  for (const method of [
    "startSession", "resumeSession", "getSession", "getHistory", "exportSession",
    "getAudit", "getDecisionTraces", "handleMessage",
  ]) {
    if (typeof agent?.[method] !== "function") {
      throw new TypeError(`Legacy Agent must implement ${method}().`);
    }
  }
}

function shadowError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
