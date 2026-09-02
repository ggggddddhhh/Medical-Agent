import { randomUUID } from "node:crypto";

export const AGENT_LOOP_TRACE_VERSION = "agent-loop-trace-0.1.0";

export class AgentLoopTraceStore {
  #entries = [];

  append(entry) {
    const stored = Object.freeze({
      traceId: randomUUID(),
      traceVersion: AGENT_LOOP_TRACE_VERSION,
      timestamp: new Date().toISOString(),
      ...structuredClone(entry),
    });
    this.#entries.push(stored);
    return structuredClone(stored);
  }

  listForSession(sessionId) {
    return this.#entries
      .filter((item) => item.sessionId === sessionId)
      .map((item) => structuredClone(item));
  }
}
