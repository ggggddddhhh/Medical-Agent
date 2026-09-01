import { randomUUID } from "node:crypto";

import {
  CASE_STATE_SCHEMA_VERSION,
  FactStatus,
} from "./constants.js";

const FACT_SECTIONS = Object.freeze([
  "patientContext",
  "symptoms",
  "redFlags",
  "relevantHistory",
]);

export function createCaseState(context = {}) {
  const state = {
    schemaVersion: CASE_STATE_SCHEMA_VERSION,
    sessionId: context.sessionId ?? randomUUID(),
    patientContext: {
      adultConfirmed: context.adultConfirmed ?? null,
      age: context.age ?? null,
      region: context.region ?? null,
      pregnant: context.pregnant ?? null,
    },
    chiefComplaint: {
      code: null,
      rawLabel: null,
    },
    symptoms: {},
    redFlags: {},
    relevantHistory: {},
    factMetadata: {},
    decisionState: {
      action: null,
      disposition: null,
      reasonCodes: [],
      pathwayVersion: null,
      pendingQuestionId: null,
    },
    askedQuestionIds: [],
    questionAttempts: {},
    turnCount: 0,
    closed: false,
  };

  for (const key of ["adultConfirmed", "age", "region", "pregnant"]) {
    const value = state.patientContext[key];
    if (value !== null && value !== undefined) {
      recordKnownFact(state, `patientContext.${key}`, value);
    }
  }
  return state;
}

export function mergeFacts(state, facts) {
  for (const section of FACT_SECTIONS) {
    for (const [key, value] of Object.entries(facts[section] ?? {})) {
      if (value !== undefined) {
        recordKnownFact(state, `${section}.${key}`, value);
      }
    }
  }

  for (const [path, status] of Object.entries(facts.factStatuses ?? {})) {
    recordUnavailableFact(state, path, status);
  }
  return state;
}

export function setDecision(state, decision) {
  state.decisionState = {
    ...state.decisionState,
    ...decision,
    reasonCodes: [...(decision.reasonCodes ?? [])],
  };
  if (decision.action !== "ASK_MORE") {
    state.decisionState.pendingQuestionId = null;
  }
  return state;
}

export function getFactStatus(state, path) {
  if (state.factMetadata[path]?.status) {
    return state.factMetadata[path].status;
  }
  const value = readPath(state, path);
  return value === undefined || value === null ? FactStatus.UNKNOWN : FactStatus.KNOWN;
}

export function isFactResolved(state, path) {
  const value = readPath(state, path);
  return Boolean(state.factMetadata[path]) || (value !== undefined && value !== null);
}

export function publicStateSnapshot(state) {
  return structuredClone({
    schemaVersion: state.schemaVersion,
    sessionId: state.sessionId,
    patientContext: state.patientContext,
    chiefComplaint: state.chiefComplaint,
    symptoms: state.symptoms,
    redFlags: state.redFlags,
    relevantHistory: state.relevantHistory,
    factMetadata: state.factMetadata,
    decisionState: state.decisionState,
    askedQuestionIds: state.askedQuestionIds,
    questionAttempts: state.questionAttempts,
    turnCount: state.turnCount,
    closed: state.closed,
  });
}

export function serializeCaseState(state) {
  return JSON.stringify(publicStateSnapshot(state));
}

export function restoreCaseState(serialized) {
  const candidate =
    typeof serialized === "string" ? JSON.parse(serialized) : structuredClone(serialized);
  validateRestoredState(candidate);
  return structuredClone(candidate);
}

function recordKnownFact(state, path, value) {
  const previous = state.factMetadata[path];
  const previousValues = previous?.values ??
    (previous?.value !== undefined ? [previous.value] : []);
  const hasConflict = previousValues.some((item) => !sameValue(item, value));
  const values = uniqueValues([...previousValues, value]);

  state.factMetadata[path] = {
    status: hasConflict || previous?.status === FactStatus.CONFLICTING
      ? FactStatus.CONFLICTING
      : FactStatus.KNOWN,
    value: structuredClone(value),
    values,
    updatedAtTurn: state.turnCount,
  };
  writePath(state, path, value);
}

function recordUnavailableFact(state, path, status) {
  if (![FactStatus.UNKNOWN, FactStatus.REFUSED].includes(status)) {
    throw new TypeError(`Unsupported unavailable fact status: ${status}`);
  }
  const previous = state.factMetadata[path];
  if (previous?.status === FactStatus.KNOWN || previous?.status === FactStatus.CONFLICTING) {
    return;
  }
  state.factMetadata[path] = {
    status,
    values: [],
    updatedAtTurn: state.turnCount,
  };
}

function validateRestoredState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("Serialized CaseState must contain an object.");
  }
  if (candidate.schemaVersion !== CASE_STATE_SCHEMA_VERSION) {
    throw new Error(`Unsupported CaseState schema version: ${candidate.schemaVersion}`);
  }
  if (typeof candidate.sessionId !== "string" || candidate.sessionId.length === 0) {
    throw new TypeError("Restored CaseState must contain a sessionId.");
  }
  for (const key of [
    "patientContext",
    "chiefComplaint",
    "symptoms",
    "redFlags",
    "relevantHistory",
    "factMetadata",
    "decisionState",
    "questionAttempts",
  ]) {
    if (!candidate[key] || typeof candidate[key] !== "object") {
      throw new TypeError(`Restored CaseState is missing ${key}.`);
    }
  }
  if (!Array.isArray(candidate.askedQuestionIds)) {
    throw new TypeError("Restored CaseState must contain askedQuestionIds.");
  }
}

function readPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function writePath(value, path, item) {
  const [section, key] = path.split(".");
  if (!FACT_SECTIONS.includes(section) || !key) {
    throw new TypeError(`Unsupported fact path: ${path}`);
  }
  value[section][key] = structuredClone(item);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueValues(values) {
  const result = [];
  for (const value of values) {
    if (!result.some((item) => sameValue(item, value))) {
      result.push(structuredClone(value));
    }
  }
  return result;
}
