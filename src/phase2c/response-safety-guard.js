import { isDeepStrictEqual } from "node:util";

import { validateOutput } from "../safety/output-safety.js";
import {
  createCanonicalUserResponse,
  RESPONSE_FIELDS,
} from "./response-generator.js";

export const RESPONSE_SAFETY_GUARD_VERSION = "response-safety-guard-0.1.0";

export class ResponseSafetyError extends Error {
  constructor(code) {
    super(`Response Layer safety policy rejected response: ${code}`);
    this.name = "ResponseSafetyError";
    this.code = code;
  }
}

export class ResponseSafetyGuard {
  validate({ candidate, decision, caseState } = {}) {
    assertExactShape(candidate);
    assertDecisionStateSupport(decision, caseState);

    const canonical = createCanonicalUserResponse(decision);
    if (!isDeepStrictEqual(candidate, canonical)) {
      throw new ResponseSafetyError("NON_CANONICAL_RESPONSE");
    }

    try {
      validateOutput({
        action: decision.action,
        disposition: decision.disposition ?? null,
        message: candidate.summary,
        guidance: [
          ...candidate.reasoning,
          ...candidate.recommendedAction,
          ...candidate.followUpQuestions,
        ],
        warnings: candidate.warningSigns,
      });
    } catch (error) {
      throw new ResponseSafetyError(error.code ?? "OUTPUT_SAFETY_REJECTED");
    }
    return structuredClone(candidate);
  }
}

function assertExactShape(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new ResponseSafetyError("INVALID_RESPONSE_SHAPE");
  }
  const keys = Object.keys(candidate).sort();
  const expectedKeys = [...RESPONSE_FIELDS].sort();
  if (!isDeepStrictEqual(keys, expectedKeys)) {
    throw new ResponseSafetyError("INVALID_RESPONSE_SHAPE");
  }
  if (typeof candidate.riskLevel !== "string" || typeof candidate.summary !== "string") {
    throw new ResponseSafetyError("INVALID_RESPONSE_FIELD");
  }
  for (const key of [
    "reasoning",
    "recommendedAction",
    "warningSigns",
    "followUpQuestions",
  ]) {
    if (!Array.isArray(candidate[key]) || candidate[key].some((item) => typeof item !== "string")) {
      throw new ResponseSafetyError("INVALID_RESPONSE_FIELD");
    }
  }
}

function assertDecisionStateSupport(decision, caseState) {
  if (!decision || !caseState || decision.sessionId !== caseState.sessionId) {
    throw new ResponseSafetyError("SESSION_MISMATCH");
  }
  if (
    decision.disposition != null &&
    decision.disposition !== caseState.decisionState?.disposition
  ) {
    throw new ResponseSafetyError("UNSUPPORTED_RISK_DECISION");
  }
}
