import { isDeepStrictEqual } from "node:util";

import { validateOutput } from "../safety/output-safety.js";
import {
  APPROVED_KNOWLEDGE_SOURCES,
  KNOWLEDGE_CORPUS_VERSION,
} from "./approved-knowledge-sources.js";

export const KNOWLEDGE_RESPONSE_GUARD_VERSION = "knowledge-response-guard-0.1.0";
const FORBIDDEN_KEYS = new Set([
  "riskLevel",
  "disposition",
  "action",
  "reasonCodes",
  "caseState",
  "clinicalFacts",
  "diagnosis",
]);
const KNOWLEDGE_NOTICE =
  "以下内容来自经审核来源，仅用于一般健康教育，不用于诊断，也不会改变上述风险判断。";

export class KnowledgeResponseSafetyError extends Error {
  constructor(code) {
    super(`Knowledge response rejected: ${code}`);
    this.name = "KnowledgeResponseSafetyError";
    this.code = code;
  }
}

export class KnowledgeResponseGuard {
  validate({ payload, request, decision } = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new KnowledgeResponseSafetyError("INVALID_ENVELOPE");
    }
    const envelopeKeys = ["corpusVersion", "items", "serviceVersion", "status"];
    if (!isDeepStrictEqual(Object.keys(payload).sort(), envelopeKeys)) {
      throw new KnowledgeResponseSafetyError("INVALID_ENVELOPE");
    }
    assertNoForbiddenKeys(payload);
    if (payload.corpusVersion !== KNOWLEDGE_CORPUS_VERSION) {
      throw new KnowledgeResponseSafetyError("UNAPPROVED_CORPUS");
    }
    if (!new Set(["available", "no_results"]).has(payload.status)) {
      throw new KnowledgeResponseSafetyError("INVALID_STATUS");
    }
    if (!Array.isArray(payload.items) || payload.items.length > request.limit) {
      throw new KnowledgeResponseSafetyError("INVALID_ITEMS");
    }
    if (payload.status === "available" && payload.items.length === 0) {
      throw new KnowledgeResponseSafetyError("EMPTY_AVAILABLE_RESULT");
    }
    if (payload.status === "no_results" && payload.items.length !== 0) {
      throw new KnowledgeResponseSafetyError("CONTENT_WITH_NO_RESULTS");
    }

    const seen = new Set();
    for (const item of payload.items) {
      assertApprovedItem(item, request.topic, seen);
    }
    try {
      validateOutput({
        action: decision.action,
        disposition: decision.disposition,
        message: KNOWLEDGE_NOTICE,
        guidance: payload.items.map((item) => item.snippet),
        warnings: [],
      });
    } catch (error) {
      throw new KnowledgeResponseSafetyError(error.code ?? "OUTPUT_SAFETY_REJECTED");
    }

    return {
      status: payload.status,
      corpusVersion: payload.corpusVersion,
      explanation: payload.status === "available" ? KNOWLEDGE_NOTICE : null,
      snippets: payload.items.map((item) => ({
        sourceId: item.sourceId,
        text: item.snippet,
      })),
      sources: payload.items.map((item) => ({
        sourceId: item.sourceId,
        title: item.title,
        url: item.url,
        reviewedAt: item.reviewedAt,
      })),
    };
  }
}

export function emptyKnowledgeSupport(status) {
  return {
    status,
    corpusVersion: null,
    explanation: null,
    snippets: [],
    sources: [],
  };
}

function assertApprovedItem(item, topic, seen) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new KnowledgeResponseSafetyError("INVALID_ITEM");
  }
  const expectedKeys = ["reviewedAt", "snippet", "sourceId", "title", "url"];
  if (!isDeepStrictEqual(Object.keys(item).sort(), expectedKeys)) {
    throw new KnowledgeResponseSafetyError("INVALID_ITEM");
  }
  const approved = APPROVED_KNOWLEDGE_SOURCES[item.sourceId];
  if (!approved || approved.topic !== topic || seen.has(item.sourceId)) {
    throw new KnowledgeResponseSafetyError("UNAPPROVED_SOURCE");
  }
  const expected = {
    sourceId: item.sourceId,
    title: approved.title,
    url: approved.url,
    reviewedAt: approved.reviewedAt,
    snippet: approved.snippet,
  };
  if (!isDeepStrictEqual(item, expected)) {
    throw new KnowledgeResponseSafetyError("SOURCE_CONTENT_MISMATCH");
  }
  seen.add(item.sourceId);
}

function assertNoForbiddenKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new KnowledgeResponseSafetyError("FORBIDDEN_DECISION_FIELD");
    }
    assertNoForbiddenKeys(item);
  }
}
