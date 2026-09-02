import { InMemoryAuditLog } from "../audit/audit-log.js";
import {
  mergeFacts,
  restoreCaseState,
  serializeCaseState,
} from "../domain/case-state.js";
import { MedicalSafetyAgent } from "../engine/medical-agent.js";

export const CORE_SESSION_BRIDGE_VERSION = "core-session-bridge-0.1.0";

export class CoreSessionBridge {
  #sessions = new Map();
  #auditLog;
  #agentFactory;

  constructor({ auditLog = new InMemoryAuditLog(), agentFactory = null } = {}) {
    this.#auditLog = auditLog;
    this.#agentFactory = agentFactory ?? ((options) => new MedicalSafetyAgent(options));
  }

  startSession(context = {}) {
    const agent = this.#createAgent();
    const sessionId = agent.startSession(context);
    this.#sessions.set(sessionId, agent);
    return sessionId;
  }

  restoreSession(serializedState) {
    const agent = this.#createAgent();
    const sessionId = agent.restoreSession(serializedState);
    if (this.#sessions.has(sessionId)) throw new Error(`Session already exists: ${sessionId}`);
    this.#sessions.set(sessionId, agent);
    return sessionId;
  }

  getState(sessionId) {
    return this.#requireAgent(sessionId).getState(sessionId);
  }

  exportSession(sessionId) {
    return this.#requireAgent(sessionId).exportSession(sessionId);
  }

  getAudit(sessionId) {
    return this.#requireAgent(sessionId).getAudit(sessionId);
  }

  getServiceNotice(sessionId) {
    return this.#requireAgent(sessionId).getServiceNotice();
  }

  handleRaw(sessionId, message) {
    return this.#requireAgent(sessionId).handleMessage(sessionId, message);
  }

  applyAcceptedFacts(sessionId, {
    pathway,
    facts = [],
    advanceTurn = true,
    evaluate = false,
  } = {}) {
    const current = restoreCaseState(this.exportSession(sessionId));
    const previousTurn = current.turnCount;
    current.turnCount = previousTurn + 1;
    applyPathway(current, pathway);
    mergeFacts(current, nestKnownFacts(facts));

    if (!advanceTurn || evaluate) current.turnCount = previousTurn;
    const replacement = this.#createAgent();
    replacement.restoreSession(serializeCaseState(current));
    this.#sessions.set(sessionId, replacement);
    return evaluate
      ? replacement.handleMessage(sessionId, "继续评估")
      : null;
  }

  #createAgent() {
    const agent = this.#agentFactory({ auditLog: this.#auditLog });
    if (!agent || typeof agent.startSession !== "function") {
      throw new TypeError("agentFactory must return a MedicalSafetyAgent-compatible object.");
    }
    return agent;
  }

  #requireAgent(sessionId) {
    const agent = this.#sessions.get(sessionId);
    if (!agent) throw new Error(`Unknown session: ${sessionId}`);
    return agent;
  }
}

function applyPathway(state, pathway) {
  if (!pathway) return;
  const complaint = ({ HEADACHE_V1: "headache", CHEST_PAIN_V1: "chest_pain" })[pathway];
  if (!complaint) throw new TypeError(`Unsupported pathway: ${pathway}`);
  if (state.chiefComplaint.code && state.chiefComplaint.code !== complaint) {
    throw new Error("Validated pathway conflicts with the active CaseState pathway.");
  }
  state.chiefComplaint.code = complaint;
  state.chiefComplaint.rawLabel = complaint === "headache" ? "头痛" : "胸痛";
}

function nestKnownFacts(facts) {
  const nested = { patientContext: {}, symptoms: {}, redFlags: {}, relevantHistory: {} };
  for (const fact of facts) {
    if (fact?.status !== "known") continue;
    if (fact.path === "chiefComplaint.code") continue;
    const [section, key] = fact.path.split(".");
    if (!Object.hasOwn(nested, section) || !key) {
      throw new TypeError(`Unsupported accepted fact path: ${fact.path}`);
    }
    nested[section][key] = structuredClone(fact.value);
  }
  return nested;
}
