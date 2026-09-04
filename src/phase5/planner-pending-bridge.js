import { InMemoryAuditLog } from "../audit/audit-log.js";
import {
  restoreCaseState,
  serializeCaseState,
} from "../domain/case-state.js";
import { CoreSessionBridge } from "../phase2b/core-session-bridge.js";
import { getProtocol } from "../protocols/index.js";

export const PLANNER_PENDING_BRIDGE_VERSION =
  "phase-5.2-planner-pending-bridge-0.1.0";

const ADULT_QUESTION = Object.freeze({
  id: "CONFIRM_ADULT",
  factPath: "patientContext.adultConfirmed",
  text: "当前版本仅支持成年人。请确认患者是否已满 18 周岁？",
});

export class PlannerPendingBridge {
  #auditLog;
  #bridgeFactory;
  #sessions = new Map();

  constructor({
    auditLog = new InMemoryAuditLog(),
    bridgeFactory,
  } = {}) {
    this.#auditLog = auditLog;
    this.#bridgeFactory = bridgeFactory ?? (() => new CoreSessionBridge({
      auditLog: this.#auditLog,
    }));
  }

  startSession(context = {}) {
    const bridge = this.#createBridge();
    const sessionId = bridge.startSession(context);
    this.#sessions.set(sessionId, bridge);
    return sessionId;
  }

  restoreSession(serializedState) {
    const bridge = this.#createBridge();
    const sessionId = bridge.restoreSession(serializedState);
    if (this.#sessions.has(sessionId)) throw new Error(`Session already exists: ${sessionId}`);
    this.#sessions.set(sessionId, bridge);
    return sessionId;
  }

  getState(sessionId) { return this.#bridgeFor(sessionId).getState(sessionId); }
  exportSession(sessionId) { return this.#bridgeFor(sessionId).exportSession(sessionId); }
  getAudit(sessionId) { return this.#bridgeFor(sessionId).getAudit(sessionId); }
  getServiceNotice(sessionId) {
    return this.#bridgeFor(sessionId).getServiceNotice(sessionId);
  }
  handleRaw(sessionId, message) {
    return this.#bridgeFor(sessionId).handleRaw(sessionId, message);
  }
  applyAcceptedFacts(sessionId, options) {
    return this.#bridgeFor(sessionId).applyAcceptedFacts(sessionId, options);
  }

  replacePendingQuestion(sessionId, candidate) {
    const current = this.getState(sessionId);
    if (current.closed || current.decisionState?.action !== "ASK_MORE") {
      throw pendingError("PENDING_REPLACEMENT_REQUIRES_OPEN_ASK_MORE");
    }
    const approved = approvedPending(current, candidate);
    if (current.decisionState.pendingQuestionId === approved.question.id) {
      return structuredClone(approved);
    }

    const state = restoreCaseState(this.exportSession(sessionId));
    state.decisionState.pendingQuestionId = approved.question.id;
    const replacement = this.#createBridge();
    replacement.restoreSession(serializeCaseState(state));
    this.#sessions.set(sessionId, replacement);
    return structuredClone(approved);
  }

  #createBridge() {
    const bridge = this.#bridgeFactory();
    for (const method of [
      "startSession",
      "restoreSession",
      "getState",
      "exportSession",
      "getAudit",
      "getServiceNotice",
      "handleRaw",
      "applyAcceptedFacts",
    ]) {
      if (typeof bridge?.[method] !== "function") {
        throw new TypeError(`PlannerPendingBridge requires bridge.${method}().`);
      }
    }
    return bridge;
  }

  #bridgeFor(sessionId) {
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) throw new Error(`Unknown session: ${sessionId}`);
    return bridge;
  }
}

function approvedPending(state, candidate) {
  if (sameQuestion(candidate, ADULT_QUESTION)) {
    return {
      source: "safety_core",
      pathway: null,
      factPath: ADULT_QUESTION.factPath,
      question: { id: ADULT_QUESTION.id, text: ADULT_QUESTION.text },
      reasonCodes: ["ADULT_STATUS_REQUIRED"],
    };
  }
  const complaint = state.chiefComplaint?.code;
  const protocol = complaint ? getProtocol(complaint) : null;
  const question = protocol?.questions?.find((item) => sameQuestion(candidate, item));
  if (!question) throw pendingError("UNAPPROVED_PLANNER_QUESTION");
  return {
    source: "clinical_pathway",
    pathway: protocol.code,
    factPath: question.factPath,
    question: { id: question.id, text: question.text },
    reasonCodes: [`MISSING_${question.id}`],
  };
}

function sameQuestion(candidate, approved) {
  return candidate?.question?.id === approved.id
    && candidate?.factPath === approved.factPath
    && candidate?.question?.text === approved.text;
}

function pendingError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
