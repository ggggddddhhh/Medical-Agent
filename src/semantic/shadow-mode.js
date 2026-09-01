import { randomUUID } from "node:crypto";

import { extractFacts } from "../extraction/fact-extractor.js";
import { detectChiefComplaint, getProtocol } from "../protocols/index.js";
import { sanitizeHybridValidation } from "./hybrid-semantic-validator.js";

export class SemanticShadowAgent {
  #agent;
  #extractor;
  #hybridValidator;
  #evaluations = [];
  #pending = new Map();

  constructor({ agent, extractor, hybridValidator = null } = {}) {
    if (!agent || typeof agent.handleMessage !== "function") {
      throw new TypeError("SemanticShadowAgent requires a core agent.");
    }
    if (!extractor || typeof extractor.run !== "function") {
      throw new TypeError("SemanticShadowAgent requires a semantic extractor.");
    }
    if (hybridValidator && typeof hybridValidator.validate !== "function") {
      throw new TypeError("hybridValidator must expose validate.");
    }
    this.#agent = agent;
    this.#extractor = extractor;
    this.#hybridValidator = hybridValidator;
  }

  startSession(context) {
    return this.#agent.startSession(context);
  }

  getState(sessionId) {
    return this.#agent.getState(sessionId);
  }

  getAudit(sessionId) {
    return this.#agent.getAudit(sessionId);
  }

  getShadowEvaluations(sessionId) {
    return this.#evaluations
      .filter((item) => item.sessionId === sessionId)
      .map((item) => structuredClone(item));
  }

  async waitForShadowEvaluations(sessionId) {
    const pending = [...(this.#pending.get(sessionId) ?? [])];
    await Promise.all(pending);
    const remaining = (this.#pending.get(sessionId) ?? []).filter(
      (item) => !pending.includes(item),
    );
    if (remaining.length === 0) {
      this.#pending.delete(sessionId);
    } else {
      this.#pending.set(sessionId, remaining);
    }
    return this.getShadowEvaluations(sessionId);
  }

  handleMessage(sessionId, message) {
    const stateBefore = this.#agent.getState(sessionId);
    const complaint = detectChiefComplaint(message) ?? stateBefore.chiefComplaint.code;
    const protocol = complaint ? getProtocol(complaint) : null;
    const deterministicFacts = protocol
      ? extractFacts(message, stateBefore, protocol)
      : null;

    // The authoritative response is completed before shadow extraction starts.
    const response = this.#agent.handleMessage(sessionId, message);
    const pending = this.#recordEvaluation({
      sessionId,
      message,
      protocol,
      deterministicFacts,
    });
    const sessionPending = this.#pending.get(sessionId) ?? [];
    sessionPending.push(pending);
    this.#pending.set(sessionId, sessionPending);
    return response;
  }

  async #recordEvaluation({ sessionId, message, protocol, deterministicFacts }) {
    const extraction = protocol
      ? await this.#extractor.run({ message, protocol })
      : {
          ...this.#extractor.metadata,
          extractionStatus: "skipped",
          validationStatus: "not_run",
          errorCode: "UNSUPPORTED_PATHWAY",
          candidate: null,
        };
    const hybridValidation = protocol && this.#hybridValidator
      ? await this.#hybridValidator.validate({ message, protocol, extraction })
      : null;
    const record = {
      evaluationId: randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId,
      pathway: protocol?.code ?? null,
      semanticExtractorVersion: extraction.semanticExtractorVersion,
      modelProvider: extraction.modelProvider,
      modelName: extraction.modelName,
      baseApiFormat: extraction.baseApiFormat,
      schemaVersion: extraction.schemaVersion,
      promptVersion: extraction.promptVersion,
      modelSnapshot: extraction.providerResponseMetadata?.modelSnapshot ?? null,
      extractionStatus: extraction.extractionStatus,
      validationStatus: extraction.validationStatus,
      errorCode: extraction.errorCode ?? null,
      candidateFacts: extraction.candidate?.facts ?? [],
      differenceSummary: compareFacts(
        deterministicFacts,
        extraction.candidate?.facts ?? [],
      ),
      hybridValidation: hybridValidation
        ? sanitizeHybridValidation(hybridValidation)
        : null,
    };
    this.#evaluations.push(record);
    return record;
  }
}

function compareFacts(deterministicFacts, semanticFacts) {
  const deterministic = flattenDeterministicFacts(deterministicFacts);
  const semantic = Object.fromEntries(
    semanticFacts.map((fact) => [fact.path, { status: fact.status, value: fact.value }]),
  );
  const paths = new Set([...Object.keys(deterministic), ...Object.keys(semantic)]);
  const matches = [];
  const differences = [];
  for (const path of paths) {
    const left = deterministic[path];
    const right = semantic[path];
    if (
      left !== undefined &&
      right?.status === "known" &&
      JSON.stringify(left) === JSON.stringify(right.value)
    ) {
      matches.push(path);
    } else {
      differences.push(path);
    }
  }
  return { matches, differences };
}

function flattenDeterministicFacts(facts) {
  if (!facts) {
    return {};
  }
  const result = {};
  for (const section of ["patientContext", "symptoms", "redFlags", "relevantHistory"]) {
    for (const [key, value] of Object.entries(facts[section] ?? {})) {
      result[`${section}.${key}`] = value;
    }
  }
  return result;
}
