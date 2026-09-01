import { randomUUID } from "node:crypto";

export class InMemoryAuditLog {
  #entries = [];

  append(entry) {
    const stored = Object.freeze({
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...structuredClone(entry),
    });
    this.#entries.push(stored);
    return stored;
  }

  get(traceId) {
    const entry = this.#entries.find((item) => item.traceId === traceId);
    return entry ? structuredClone(entry) : null;
  }

  listForSession(sessionId) {
    return this.#entries
      .filter((item) => item.sessionId === sessionId)
      .map((item) => structuredClone(item));
  }
}
