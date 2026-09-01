import { randomUUID } from "node:crypto";

export function createCaseState(context = {}) {
  return {
    sessionId: randomUUID(),
    patientContext: {
      adultConfirmed: context.adultConfirmed ?? null,
      age: context.age ?? null,
      region: context.region ?? null,
    },
    chiefComplaint: {
      code: null,
      rawLabel: null,
    },
    symptoms: {},
    redFlags: {},
    relevantHistory: {},
    decisionState: {
      action: null,
      disposition: null,
      reasonCodes: [],
      pathwayVersion: null,
      pendingQuestionId: null,
    },
    askedQuestionIds: [],
    turnCount: 0,
    closed: false,
  };
}

export function mergeFacts(state, facts) {
  if (facts.patientContext) {
    Object.assign(state.patientContext, removeUndefined(facts.patientContext));
  }
  if (facts.symptoms) {
    Object.assign(state.symptoms, removeUndefined(facts.symptoms));
  }
  if (facts.redFlags) {
    Object.assign(state.redFlags, removeUndefined(facts.redFlags));
  }
  if (facts.relevantHistory) {
    Object.assign(state.relevantHistory, removeUndefined(facts.relevantHistory));
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

export function publicStateSnapshot(state) {
  return {
    patientContext: { ...state.patientContext },
    chiefComplaint: { ...state.chiefComplaint },
    symptoms: { ...state.symptoms },
    redFlags: { ...state.redFlags },
    relevantHistory: { ...state.relevantHistory },
    decisionState: { ...state.decisionState },
    turnCount: state.turnCount,
    closed: state.closed,
  };
}

function removeUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}
