import { getDemoCase, listDemoCases } from "./demo-cases.js";

export const DEMO_APPLICATION_VERSION = "phase-4-demo-application-0.1.0";

export class DemoApplication {
  #agent;

  constructor({ agent } = {}) {
    if (!agent || typeof agent.handleMessage !== "function") {
      throw new TypeError("DemoApplication requires a Phase 3 Agent.");
    }
    this.#agent = agent;
  }

  listCases() {
    return listDemoCases();
  }

  startSession(options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw demoError("INVALID_SESSION_REQUEST", "Session request must be an object.");
    }
    if (Object.keys(options).some((key) => !["caseId", "context"].includes(key))) {
      throw demoError("INVALID_SESSION_REQUEST", "Session request contains unknown fields.");
    }
    const { caseId = null, context = {} } = options;
    if (caseId != null && (typeof caseId !== "string" || caseId.length === 0)) {
      throw demoError("INVALID_SESSION_REQUEST", "caseId must be a non-empty string.");
    }
    if (caseId != null && Object.keys(context ?? {}).length > 0) {
      throw demoError("AMBIGUOUS_SESSION_CONTEXT", "Use either caseId or context.");
    }
    const selectedCase = caseId == null ? null : getDemoCase(caseId);
    const sessionContext = selectedCase?.context ?? validateContext(context);
    const sessionId = this.#agent.startSession(sessionContext);
    return {
      demoVersion: DEMO_APPLICATION_VERSION,
      sessionId,
      caseId: selectedCase?.id ?? null,
      ...this.#agent.getSession(sessionId),
    };
  }

  getSession(sessionId) {
    return {
      demoVersion: DEMO_APPLICATION_VERSION,
      sessionId,
      ...this.#agent.getSession(sessionId),
    };
  }

  async resumeSession(sessionId) {
    if (typeof this.#agent.resumeSession !== "function") {
      throw demoError("MEMORY_NOT_AVAILABLE", "This Demo agent has no Memory Layer.");
    }
    return {
      demoVersion: DEMO_APPLICATION_VERSION,
      sessionId,
      ...await this.#agent.resumeSession(sessionId),
    };
  }

  getHistory(sessionId) {
    if (typeof this.#agent.getHistory !== "function") {
      throw demoError("MEMORY_NOT_AVAILABLE", "This Demo agent has no Memory Layer.");
    }
    return this.#agent.getHistory(sessionId);
  }

  async handleMessage(sessionId, message) {
    if (typeof message !== "string" || message.trim().length === 0) {
      throw demoError("INVALID_MESSAGE", "message must be non-empty.");
    }
    return this.#agent.handleMessage(sessionId, message);
  }

  async runCase(caseId) {
    const demoCase = getDemoCase(caseId);
    const session = this.startSession({ caseId });
    const turns = [];
    for (const [index, userMessage] of demoCase.messages.entries()) {
      const response = await this.handleMessage(session.sessionId, userMessage);
      turns.push({ turn: index + 1, userMessage, response });
    }
    const finalResponse = turns.at(-1).response;
    const verification = {
      actionMatches: finalResponse.action === demoCase.expected.action,
      dispositionMatches: finalResponse.disposition === demoCase.expected.disposition,
      knowledgeStatusMatches:
        finalResponse.knowledgeSupport?.status === demoCase.expected.knowledgeStatus,
    };
    return {
      demoVersion: DEMO_APPLICATION_VERSION,
      case: demoCase,
      sessionId: session.sessionId,
      turns,
      finalResponse,
      verification: {
        ...verification,
        passed: Object.values(verification).every(Boolean),
      },
    };
  }
}

function validateContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw demoError("INVALID_CONTEXT", "context must be an object.");
  }
  if (Object.keys(context).some((key) => key !== "adultConfirmed")) {
    throw demoError("INVALID_CONTEXT", "Demo context only accepts adultConfirmed.");
  }
  if (
    Object.hasOwn(context, "adultConfirmed")
    && typeof context.adultConfirmed !== "boolean"
  ) {
    throw demoError("INVALID_CONTEXT", "adultConfirmed must be boolean.");
  }
  return structuredClone(context);
}

function demoError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
