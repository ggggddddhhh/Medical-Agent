import { FactMemory } from "./fact-memory.js";
import {
  FileSessionManager,
  MEMORY_CHECKPOINT_SCHEMA_VERSION,
} from "./session-manager.js";
import { QuestionPlanner } from "./question-planner.js";

export const MEMORY_LAYER_VERSION = "phase-5-memory-layer-0.1.0";

export class MemoryLayerAgent {
  #agentFactory;
  #sessionManager;
  #factMemory;
  #questionPlanner;
  #clock;
  #agents = new Map();
  #records = new Map();
  #persistenceFailures = new Map();

  constructor({
    agentFactory,
    sessionManager = new FileSessionManager(),
    factMemory = new FactMemory(),
    questionPlanner = new QuestionPlanner(),
    clock = () => new Date(),
  } = {}) {
    if (typeof agentFactory !== "function") {
      throw new TypeError("MemoryLayerAgent requires agentFactory.");
    }
    this.#agentFactory = agentFactory;
    this.#sessionManager = sessionManager;
    this.#factMemory = factMemory;
    this.#questionPlanner = questionPlanner;
    this.#clock = clock;
  }

  startSession(context = {}) {
    const agent = this.#createAgent();
    const sessionId = agent.startSession(context);
    this.#agents.set(sessionId, agent);
    const session = agent.getSession(sessionId);
    const factMemory = this.#factMemory.snapshot(session.state);
    const checkpoint = {
      schemaVersion: MEMORY_CHECKPOINT_SCHEMA_VERSION,
      sessionId,
      createdAt: this.#clock().toISOString(),
      updatedAt: this.#clock().toISOString(),
      initialContext: safeInitialContext(context),
      caseState: structuredClone(session.state),
      pendingClarification: structuredClone(session.pendingClarification ?? null),
      history: [],
      snapshots: [{
        turn: session.state.turnCount,
        caseState: structuredClone(session.state),
        capturedAt: this.#clock().toISOString(),
      }],
      factMemory,
      questionMemory: {
        version: "phase-5-question-memory-0.1.0",
        questions: [],
        nextQuestion: null,
        duplicateQuestionFiltered: false,
      },
    };
    this.#records.set(sessionId, checkpoint);
    this.#persist(checkpoint);
    return sessionId;
  }

  async resumeSession(sessionId) {
    if (this.#agents.has(sessionId)) return this.getSession(sessionId);
    const checkpoint = this.#sessionManager.load(sessionId);
    const agent = this.#createAgent();

    if (checkpoint.pendingClarification && checkpoint.history.length > 0) {
      const restoredId = agent.startSession({
        ...safeInitialContext(checkpoint.initialContext),
        sessionId,
      });
      if (restoredId !== sessionId) throw restoreError("SESSION_ID_DRIFT");
      for (const entry of checkpoint.history) {
        if (entry.role === "user") await agent.handleMessage(sessionId, entry.content);
      }
      const restored = agent.getSession(sessionId);
      if (
        fingerprint(restored.state) !== fingerprint(checkpoint.caseState)
        || fingerprint(restored.pendingClarification ?? null)
          !== fingerprint(checkpoint.pendingClarification)
      ) {
        throw restoreError("SESSION_RESTORE_DRIFT");
      }
    } else {
      const restoredId = agent.restoreSession(JSON.stringify(checkpoint.caseState));
      if (restoredId !== sessionId) throw restoreError("SESSION_ID_DRIFT");
    }

    this.#agents.set(sessionId, agent);
    this.#records.set(sessionId, structuredClone(checkpoint));
    return this.getSession(sessionId);
  }

  async handleMessage(sessionId, message) {
    const agent = await this.#ensureAgent(sessionId);
    const checkpoint = this.#recordFor(sessionId);
    const response = await agent.handleMessage(sessionId, message);
    const session = agent.getSession(sessionId);
    const factMemory = this.#factMemory.snapshot(session.state);
    const questionMemory = this.#questionPlanner.observe({
      response,
      caseState: session.state,
      factMemory,
      questionMemory: checkpoint.questionMemory,
    });
    const timestamp = this.#clock().toISOString();
    const updated = {
      ...checkpoint,
      caseState: structuredClone(session.state),
      pendingClarification: structuredClone(session.pendingClarification ?? null),
      history: [
        ...checkpoint.history,
        { role: "user", content: message, turn: session.state.turnCount, timestamp },
        {
          role: "assistant",
          content: assistantContent(response),
          turn: session.state.turnCount,
          timestamp,
        },
      ],
      snapshots: [
        ...checkpoint.snapshots,
        {
          turn: session.state.turnCount,
          caseState: structuredClone(session.state),
          capturedAt: timestamp,
        },
      ],
      factMemory,
      questionMemory,
    };
    this.#records.set(sessionId, updated);
    this.#persist(updated);
    return {
      ...response,
      memory: memorySummary(updated, this.#persistenceFailures.get(sessionId)),
    };
  }

  getSession(sessionId) {
    const agent = this.#requireAgent(sessionId);
    const checkpoint = this.#recordFor(sessionId);
    return {
      memoryLayerVersion: MEMORY_LAYER_VERSION,
      ...agent.getSession(sessionId),
      memory: memorySummary(checkpoint, this.#persistenceFailures.get(sessionId)),
    };
  }

  getHistory(sessionId) {
    this.#requireAgent(sessionId);
    return structuredClone(this.#recordFor(sessionId).history);
  }

  exportSession(sessionId) {
    return this.#requireAgent(sessionId).exportSession(sessionId);
  }

  getAudit(sessionId) {
    return this.#requireAgent(sessionId).getAudit(sessionId);
  }

  getDecisionTraces(sessionId) {
    return this.#requireAgent(sessionId).getDecisionTraces(sessionId);
  }

  #createAgent() {
    const agent = this.#agentFactory();
    for (const method of ["startSession", "restoreSession", "exportSession", "getSession", "handleMessage"]) {
      if (typeof agent?.[method] !== "function") {
        throw new TypeError(`Memory agent factory result must implement ${method}.`);
      }
    }
    return agent;
  }

  async #ensureAgent(sessionId) {
    if (!this.#agents.has(sessionId)) await this.resumeSession(sessionId);
    return this.#requireAgent(sessionId);
  }

  #requireAgent(sessionId) {
    const agent = this.#agents.get(sessionId);
    if (!agent) {
      const error = new Error(`Session is not active: ${sessionId}`);
      error.code = "SESSION_NOT_ACTIVE";
      throw error;
    }
    return agent;
  }

  #recordFor(sessionId) {
    const checkpoint = this.#records.get(sessionId);
    if (!checkpoint) throw new Error(`Memory record not loaded: ${sessionId}`);
    return checkpoint;
  }

  #persist(checkpoint) {
    try {
      const stored = this.#sessionManager.save(checkpoint);
      this.#records.set(checkpoint.sessionId, stored);
      this.#persistenceFailures.delete(checkpoint.sessionId);
    } catch (error) {
      this.#persistenceFailures.set(
        checkpoint.sessionId,
        error?.code ?? error?.name ?? "MEMORY_PERSISTENCE_ERROR",
      );
    }
  }
}

function safeInitialContext(context = {}) {
  const allowed = ["adultConfirmed", "age", "region", "pregnant"];
  return Object.fromEntries(
    Object.entries(context ?? {})
      .filter(([key, value]) => allowed.includes(key) && value !== undefined)
      .map(([key, value]) => [key, structuredClone(value)]),
  );
}

function assistantContent(response) {
  return response?.summary ?? response?.message ?? "";
}

function memorySummary(checkpoint, failureCode = null) {
  return {
    version: MEMORY_LAYER_VERSION,
    persistenceStatus: failureCode ? "unavailable" : "available",
    persistenceErrorCode: failureCode,
    restorable: !failureCode,
    historyMessageCount: checkpoint.history.length,
    snapshotCount: checkpoint.snapshots.length,
    confirmedFactCount: checkpoint.factMemory.confirmedFacts.length,
    answeredFactPaths: [...checkpoint.factMemory.answeredFactPaths],
    nextQuestion: structuredClone(checkpoint.questionMemory.nextQuestion),
    duplicateQuestionFiltered: checkpoint.questionMemory.duplicateQuestionFiltered,
  };
}

function fingerprint(value) {
  return JSON.stringify(value);
}

function restoreError(code) {
  const error = new Error(`Session restore failed safe: ${code}`);
  error.code = code;
  return error;
}
