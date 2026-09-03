import { KnowledgeResponseGuard, emptyKnowledgeSupport } from "./knowledge-response-guard.js";
import { KnowledgeSupportPolicy } from "./knowledge-support-policy.js";

export const KNOWLEDGE_ENRICHED_AGENT_VERSION = "phase-3-knowledge-enriched-agent-0.1.0";

export class KnowledgeEnrichedAgent {
  #agent;
  #client;
  #policy;
  #guard;

  constructor({
    agent,
    knowledgeClient,
    knowledgePolicy = new KnowledgeSupportPolicy(),
    knowledgeGuard = new KnowledgeResponseGuard(),
  } = {}) {
    if (!agent || typeof agent.handleMessage !== "function") {
      throw new TypeError("KnowledgeEnrichedAgent requires a Response Layer agent.");
    }
    if (!knowledgeClient || typeof knowledgeClient.query !== "function") {
      throw new TypeError("KnowledgeEnrichedAgent requires a knowledge client.");
    }
    this.#agent = agent;
    this.#client = knowledgeClient;
    this.#policy = knowledgePolicy;
    this.#guard = knowledgeGuard;
  }

  startSession(context = {}) { return this.#agent.startSession(context); }
  restoreSession(serializedState) { return this.#agent.restoreSession(serializedState); }
  exportSession(sessionId) { return this.#agent.exportSession(sessionId); }
  getAudit(sessionId) { return this.#agent.getAudit(sessionId); }
  getDecisionTraces(sessionId) { return this.#agent.getDecisionTraces(sessionId); }

  getSession(sessionId) {
    return {
      knowledgeLayerVersion: KNOWLEDGE_ENRICHED_AGENT_VERSION,
      ...this.#agent.getSession(sessionId),
    };
  }

  async handleMessage(sessionId, message) {
    const decision = await this.#agent.handleMessage(sessionId, message);
    const stateBefore = this.#agent.getSession(sessionId).state;
    const fingerprint = JSON.stringify(stateBefore);
    const request = this.#policy.createRequest({ decision, caseState: stateBefore });
    if (!request) {
      return { ...decision, knowledgeSupport: emptyKnowledgeSupport("not_requested") };
    }

    let knowledgeSupport;
    try {
      const payload = await this.#client.query(request);
      knowledgeSupport = this.#guard.validate({ payload, request, decision });
    } catch {
      knowledgeSupport = emptyKnowledgeSupport("unavailable");
    }
    if (JSON.stringify(this.#agent.getSession(sessionId).state) !== fingerprint) {
      knowledgeSupport = emptyKnowledgeSupport("unavailable");
    }
    return { ...decision, knowledgeSupport };
  }
}
