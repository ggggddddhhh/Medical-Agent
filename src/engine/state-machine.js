import { AgentAction } from "../domain/constants.js";

const INITIAL = "__INITIAL__";

export const LEGAL_ACTION_TRANSITIONS = Object.freeze({
  [INITIAL]: Object.freeze([
    AgentAction.ASK_MORE,
    AgentAction.DISPOSITION,
    AgentAction.SAFETY_ESCALATION,
    AgentAction.OUT_OF_SCOPE,
    AgentAction.INSUFFICIENT_INFO,
  ]),
  [AgentAction.ASK_MORE]: Object.freeze([
    AgentAction.ASK_MORE,
    AgentAction.DISPOSITION,
    AgentAction.SAFETY_ESCALATION,
    AgentAction.OUT_OF_SCOPE,
    AgentAction.INSUFFICIENT_INFO,
  ]),
  [AgentAction.OUT_OF_SCOPE]: Object.freeze([
    AgentAction.ASK_MORE,
    AgentAction.DISPOSITION,
    AgentAction.SAFETY_ESCALATION,
    AgentAction.OUT_OF_SCOPE,
    AgentAction.INSUFFICIENT_INFO,
  ]),
  [AgentAction.DISPOSITION]: Object.freeze([
    AgentAction.DISPOSITION,
    AgentAction.SAFETY_ESCALATION,
  ]),
  [AgentAction.INSUFFICIENT_INFO]: Object.freeze([
    AgentAction.INSUFFICIENT_INFO,
    AgentAction.SAFETY_ESCALATION,
  ]),
  [AgentAction.SAFETY_ESCALATION]: Object.freeze([
    AgentAction.SAFETY_ESCALATION,
  ]),
});

export function assertActionTransition(previousAction, nextAction) {
  const from = previousAction ?? INITIAL;
  const allowed = LEGAL_ACTION_TRANSITIONS[from];
  if (!allowed?.includes(nextAction)) {
    throw new Error(`Illegal agent action transition: ${from} -> ${nextAction}`);
  }
  return true;
}

export function isTerminalAction(action) {
  return [
    AgentAction.DISPOSITION,
    AgentAction.SAFETY_ESCALATION,
    AgentAction.INSUFFICIENT_INFO,
  ].includes(action);
}
