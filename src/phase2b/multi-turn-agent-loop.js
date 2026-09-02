import { AgentAction, Disposition } from "../domain/constants.js";
import { detectChiefComplaint, getProtocol } from "../protocols/index.js";
import { scanInput } from "../safety/input-safety.js";
import { isHighRiskSemanticPath } from "../semantic/safety-signal-detector.js";
import { AgentLoopTraceStore } from "./agent-loop-trace.js";
import { ClarificationAnswerResolver } from "./clarification-answer-resolver.js";
import { CoreSessionBridge } from "./core-session-bridge.js";

export const MULTI_TURN_AGENT_LOOP_VERSION = "multi-turn-agent-loop-0.1.0";

export class MultiTurnAgentLoop {
  #extractor;
  #validator;
  #bridge;
  #resolver;
  #traceStore;
  #pending = new Map();
  #active = new Set();

  constructor({
    extractor,
    hybridValidator,
    bridge = new CoreSessionBridge(),
    clarificationResolver = new ClarificationAnswerResolver(),
    traceStore = new AgentLoopTraceStore(),
  } = {}) {
    if (!extractor || typeof extractor.run !== "function") {
      throw new TypeError("MultiTurnAgentLoop requires extractor.run.");
    }
    if (!hybridValidator || typeof hybridValidator.validate !== "function") {
      throw new TypeError("MultiTurnAgentLoop requires hybridValidator.validate.");
    }
    this.#extractor = extractor;
    this.#validator = hybridValidator;
    this.#bridge = bridge;
    this.#resolver = clarificationResolver;
    this.#traceStore = traceStore;
  }

  startSession(context = {}) {
    return this.#bridge.startSession(context);
  }

  restoreSession(serializedState) {
    return this.#bridge.restoreSession(serializedState);
  }

  exportSession(sessionId) {
    return this.#bridge.exportSession(sessionId);
  }

  getSession(sessionId) {
    return {
      loopVersion: MULTI_TURN_AGENT_LOOP_VERSION,
      state: this.#bridge.getState(sessionId),
      pendingClarification: publicPending(this.#pending.get(sessionId)),
    };
  }

  getAudit(sessionId) {
    return this.#bridge.getAudit(sessionId);
  }

  getDecisionTraces(sessionId) {
    this.#bridge.getState(sessionId);
    return this.#traceStore.listForSession(sessionId);
  }

  async handleMessage(sessionId, message) {
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError("message must be a non-empty string.");
    }
    if (this.#active.has(sessionId)) {
      const error = new Error("A turn is already running for this session.");
      error.code = "SESSION_TURN_IN_PROGRESS";
      throw error;
    }
    this.#active.add(sessionId);
    try {
      return await this.#handleMessage(sessionId, message);
    } finally {
      this.#active.delete(sessionId);
    }
  }

  async #handleMessage(sessionId, message) {
    const stateBefore = this.#bridge.getState(sessionId);
    const pendingBefore = this.#pending.get(sessionId) ?? null;

    if (scanInput(message)) {
      this.#pending.delete(sessionId);
      const response = this.#bridge.handleRaw(sessionId, message);
      this.#syncCoreQuestion(sessionId, response, stateBefore.chiefComplaint.code);
      return this.#finalize(sessionId, response, {
        pathway: pathwayForComplaint(stateBefore.chiefComplaint.code),
        extractionStatus: "skipped_input_safety",
        decisions: [],
        acceptedFacts: [],
        fallback: true,
      });
    }

    const complaint = complaintFor(message, stateBefore, pendingBefore);
    const protocol = complaint ? getProtocol(complaint) : null;
    if (!protocol) {
      const response = this.#bridge.handleRaw(sessionId, message);
      return this.#finalize(sessionId, response, {
        pathway: null,
        extractionStatus: "skipped_unsupported_pathway",
        decisions: [],
        acceptedFacts: [],
        fallback: true,
      });
    }

    const contextFacts = contextFactsFrom(stateBefore);
    const extraction = await this.#extractor.run({ message, protocol, contextFacts });
    if (extraction.extractionStatus !== "completed" || extraction.validationStatus !== "valid") {
      const response = this.#bridge.handleRaw(sessionId, message);
      this.#syncCoreQuestion(sessionId, response, complaint);
      return this.#finalize(sessionId, response, {
        pathway: protocol.code,
        extractionStatus: extraction.extractionStatus,
        decisions: [],
        acceptedFacts: [],
        fallback: true,
      });
    }

    const hybrid = await this.#validator.validate({
      message,
      protocol,
      extraction,
      contextFacts,
    });
    let decisions = [...hybrid.decisions];
    let resolvedPendingPath = null;
    if (pendingBefore?.source === "semantic") {
      const direct = decisions.find((item) =>
        item.factPath === pendingBefore.factPath && item.decision !== "UNCERTAIN");
      const resolved = direct ?? this.#resolver.resolve({ message, pending: pendingBefore });
      if (resolved) {
        decisions = replaceDecision(decisions, resolved);
        if (["ACCEPT", "REJECT"].includes(resolved.decision)) {
          resolvedPendingPath = resolved.factPath;
          this.#pending.delete(sessionId);
        }
      }
    }

    const acceptedFacts = uniqueAcceptedFacts(decisions);
    const clarification = selectClarification(decisions, resolvedPendingPath);
    const traceContext = {
      pathway: protocol.code,
      extractionStatus: extraction.extractionStatus,
      decisions,
      acceptedFacts,
      fallback: false,
    };

    if (pendingBefore?.source === "core") {
      if (clarification) {
        const mustEvaluate = acceptedFacts.some((fact) =>
          fact.value === true && isHighRiskSemanticPath(fact.path));
        const coreResponse = this.#bridge.applyAcceptedFacts(sessionId, {
          pathway: stateBefore.chiefComplaint.code || acceptedFacts.length > 0
            ? protocol.code
            : null,
          facts: acceptedFacts,
          advanceTurn: true,
          evaluate: mustEvaluate,
        });
        if (coreResponse && isEmergency(coreResponse)) {
          this.#pending.delete(sessionId);
          return this.#finalize(sessionId, coreResponse, traceContext);
        }
        this.#pending.set(sessionId, semanticPending(
          clarification,
          protocol.code,
          proposedValueFor(hybrid, clarification.factPath),
        ));
        return this.#finalize(sessionId, clarificationResponse(clarification), traceContext);
      }
      this.#bridge.applyAcceptedFacts(sessionId, {
        pathway: acceptedFacts.length > 0 ? protocol.code : null,
        facts: acceptedFacts,
        advanceTurn: false,
        evaluate: false,
      });
      const coreResponse = this.#bridge.handleRaw(sessionId, message);
      if (isEmergency(coreResponse)) {
        this.#pending.delete(sessionId);
        return this.#finalize(sessionId, coreResponse, traceContext);
      }
      this.#syncCoreQuestion(sessionId, coreResponse, complaint);
      return this.#finalize(sessionId, coreResponse, traceContext);
    }

    if (clarification) {
      const mustEvaluate = acceptedFacts.some((fact) =>
        fact.value === true && isHighRiskSemanticPath(fact.path));
      const pathway = stateBefore.chiefComplaint.code ||
        acceptedFacts.some((fact) => fact.path === "chiefComplaint.code")
        ? protocol.code
        : null;
      const coreResponse = this.#bridge.applyAcceptedFacts(sessionId, {
        pathway,
        facts: acceptedFacts,
        advanceTurn: true,
        evaluate: mustEvaluate,
      });
      if (coreResponse && isEmergency(coreResponse)) {
        this.#pending.delete(sessionId);
        return this.#finalize(sessionId, coreResponse, traceContext);
      }
      this.#pending.set(sessionId, semanticPending(
        clarification,
        protocol.code,
        proposedValueFor(hybrid, clarification.factPath),
      ));
      return this.#finalize(sessionId, clarificationResponse(clarification), traceContext);
    }

    if (acceptedFacts.length > 0 || stateBefore.chiefComplaint.code) {
      const response = this.#bridge.applyAcceptedFacts(sessionId, {
        pathway: protocol.code,
        facts: acceptedFacts,
        advanceTurn: true,
        evaluate: true,
      });
      this.#syncCoreQuestion(sessionId, response, complaint);
      return this.#finalize(sessionId, response, traceContext);
    }

    this.#bridge.applyAcceptedFacts(sessionId, { advanceTurn: true });
    const response = rejectedResponse(decisions, this.#bridge.getServiceNotice(sessionId));
    return this.#finalize(sessionId, response, traceContext);
  }

  #syncCoreQuestion(sessionId, response, complaint) {
    if (response?.action !== AgentAction.ASK_MORE || !response.question) {
      this.#pending.delete(sessionId);
      return;
    }
    const protocol = complaint ? getProtocol(complaint) : null;
    const protocolQuestion = protocol?.questions.find((item) => item.id === response.question.id);
    this.#pending.set(sessionId, {
      source: "core",
      pathway: protocol?.code ?? null,
      factPath: protocolQuestion?.factPath ??
        (response.question.id === "CONFIRM_ADULT" ? "patientContext.adultConfirmed" : null),
      questionId: response.question.id,
      question: response.question.text,
      reasonCodes: [...(response.reasonCodes ?? [])],
      decision: null,
    });
  }

  #finalize(sessionId, response, context) {
    const state = this.#bridge.getState(sessionId);
    const coreDecisionTraceId = response?.decisionTraceId ?? null;
    const semantic = semanticSummary(context.extractionStatus, context.decisions, context.fallback);
    const trace = this.#traceStore.append({
      sessionId,
      turn: state.turnCount,
      pathway: context.pathway,
      extractionStatus: context.extractionStatus,
      gateSummary: semantic.gateSummary,
      acceptedFactPaths: context.acceptedFacts.map((item) => item.path),
      pendingFactPath: this.#pending.get(sessionId)?.factPath ?? null,
      action: response.action,
      disposition: response.disposition ?? null,
      coreDecisionTraceId,
      fallbackToSafetyCore: context.fallback,
    });
    return {
      sessionId,
      notice: response.notice ?? this.#bridge.getServiceNotice(sessionId),
      guidance: response.guidance ?? [],
      warnings: response.warnings ?? [],
      ...response,
      sessionId,
      decisionTraceId: trace.traceId,
      coreDecisionTraceId,
      semantic,
      pendingClarification: publicPending(this.#pending.get(sessionId)),
    };
  }
}

function complaintFor(message, state, pending) {
  if (pending?.pathway) return complaintFromPathway(pending.pathway);
  return detectChiefComplaint(message) ?? state.chiefComplaint.code;
}

function complaintFromPathway(pathway) {
  return ({ HEADACHE_V1: "headache", CHEST_PAIN_V1: "chest_pain" })[pathway] ?? null;
}

function pathwayForComplaint(complaint) {
  return complaint ? getProtocol(complaint)?.code ?? null : null;
}

function contextFactsFrom(state) {
  return Object.entries(state.factMetadata).map(([path, metadata]) => ({
    path,
    value: metadata.value ?? null,
    status: metadata.status,
    confidence: metadata.status === "known" ? 1 : 0.5,
    temporality: "unspecified",
    contradictionCandidate: metadata.status === "conflicting",
  }));
}

function uniqueAcceptedFacts(decisions) {
  const byPath = new Map();
  for (const decision of decisions) {
    if (decision.decision === "ACCEPT" && decision.candidate?.status === "known") {
      byPath.set(decision.factPath, structuredClone(decision.candidate));
    }
  }
  return [...byPath.values()];
}

function selectClarification(decisions, ignoredPath) {
  const candidates = decisions.filter((item) =>
    item.factPath !== ignoredPath &&
    item.decision === "UNCERTAIN" &&
    item.clarification?.question);
  return candidates.sort((left, right) =>
    Number(isHighRiskSemanticPath(right.factPath)) - Number(isHighRiskSemanticPath(left.factPath)))[0] ?? null;
}

function replaceDecision(decisions, replacement) {
  return [
    ...decisions.filter((item) => item.factPath !== replacement.factPath),
    replacement,
  ];
}

function semanticPending(decision, pathway, proposedValue) {
  return {
    source: "semantic",
    pathway,
    factPath: decision.factPath,
    questionId: `SEMANTIC_${decision.factPath.replaceAll(".", "_").toUpperCase()}`,
    question: decision.clarification.question,
    reasonCodes: [...decision.clarification.reasonCodes],
    proposedValue: structuredClone(proposedValue),
    decision: structuredClone(decision),
  };
}

function proposedValueFor(hybrid, path) {
  for (const assertion of hybrid.linguisticAssertions?.assertions ?? []) {
    const hint = assertion.conceptHints?.find((item) => item.factPath === path);
    if (hint && !["parse_duration", "parse_severity"].includes(hint.proposedValue)) {
      return hint.proposedValue;
    }
  }
  return hybrid.detector?.candidates?.find((item) => item.factPath === path)?.proposedValue;
}

function publicPending(pending) {
  if (!pending) return null;
  return {
    source: pending.source,
    pathway: pending.pathway,
    factPath: pending.factPath,
    question: { id: pending.questionId, text: pending.question },
    reasonCodes: [...pending.reasonCodes],
  };
}

function clarificationResponse(decision) {
  return {
    action: AgentAction.ASK_MORE,
    disposition: null,
    reasonCodes: ["SEMANTIC_CLARIFICATION_REQUIRED", ...decision.clarification.reasonCodes],
    message: decision.clarification.question,
    question: {
      id: `SEMANTIC_${decision.factPath.replaceAll(".", "_").toUpperCase()}`,
      factPath: decision.factPath,
      text: decision.clarification.question,
    },
  };
}

function rejectedResponse(decisions, notice) {
  return {
    notice,
    guidance: [],
    warnings: [],
    action: AgentAction.OUT_OF_SCOPE,
    disposition: null,
    reasonCodes: ["SEMANTIC_EVIDENCE_REJECTED"],
    message: decisions.length > 0
      ? "没有确认到属于您本人的可用症状事实；如需继续，请明确说明症状是否发生在您本人。"
      : "没有取得可安全使用的症状信息，请更具体地描述您本人的头痛或胸痛情况。",
  };
}

function semanticSummary(extractionStatus, decisions, fallback) {
  const gateSummary = Object.fromEntries(["ACCEPT", "UNCERTAIN", "REJECT"].map((status) => [
    status,
    decisions.filter((item) => item.decision === status).length,
  ]));
  return {
    loopVersion: MULTI_TURN_AGENT_LOOP_VERSION,
    extractionStatus,
    fallbackToSafetyCore: fallback,
    gateSummary,
    decisions: decisions.map((item) => ({
      factPath: item.factPath,
      decision: item.decision,
      reasonCodes: [...item.reasonCodes],
      clarificationReasonCodes: [...(item.clarification?.reasonCodes ?? [])],
    })),
  };
}

function isEmergency(response) {
  return response?.action === AgentAction.SAFETY_ESCALATION ||
    response?.disposition === Disposition.EMERGENCY_NOW;
}
