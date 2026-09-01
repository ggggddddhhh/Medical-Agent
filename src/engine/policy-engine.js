import {
  AgentAction,
  ChiefComplaint,
  Disposition,
  POLICY_VERSION,
  FactStatus,
} from "../domain/constants.js";
import {
  getFactStatus,
  isFactResolved,
} from "../domain/case-state.js";

const CONFIRM_ADULT_QUESTION = Object.freeze({
  id: "CONFIRM_ADULT",
  factPath: "patientContext.adultConfirmed",
  parser: "boolean",
  text: "当前版本仅支持成年人。请确认患者是否已满 18 周岁？",
});

export function decideNextAction(state, protocol) {
  const emergencyRuleHits = protocol.emergencyRules
    .filter((rule) => rule.when(state))
    .map((rule) => rule.id);

  if (emergencyRuleHits.length > 0) {
    return {
      action: AgentAction.SAFETY_ESCALATION,
      disposition: Disposition.EMERGENCY_NOW,
      reasonCodes: emergencyRuleHits,
      policyVersion: POLICY_VERSION,
    };
  }

  if (state.patientContext.adultConfirmed === false) {
    return {
      action: AgentAction.OUT_OF_SCOPE,
      disposition: null,
      reasonCodes: ["ADULTS_ONLY"],
      policyVersion: POLICY_VERSION,
    };
  }

  if (state.patientContext.pregnant === true) {
    return {
      action: AgentAction.OUT_OF_SCOPE,
      disposition: null,
      reasonCodes: ["PREGNANCY_OUT_OF_SCOPE"],
      policyVersion: POLICY_VERSION,
    };
  }

  if (state.patientContext.adultConfirmed !== true) {
    if (isFactResolved(state, "patientContext.adultConfirmed")) {
      return insufficient(["ADULT_STATUS_UNAVAILABLE"]);
    }
    return askMore(CONFIRM_ADULT_QUESTION, ["ADULT_STATUS_REQUIRED"]);
  }

  const nextQuestion = protocol.questions.find(
    (question) => !isFactResolved(state, question.factPath),
  );

  if (nextQuestion && state.turnCount >= 12) {
    return insufficient(["MAX_TURNS_WITH_REQUIRED_FACTS_MISSING"]);
  }

  if (nextQuestion) {
    return askMore(nextQuestion, [`MISSING_${nextQuestion.id}`]);
  }

  const unavailableFacts = protocol.questions
    .map((question) => ({
      id: question.id,
      status: getFactStatus(state, question.factPath),
    }))
    .filter(({ status }) => status !== FactStatus.KNOWN);
  if (unavailableFacts.length > 0) {
    return insufficient([
      "REQUIRED_FACTS_UNAVAILABLE",
      ...unavailableFacts.map(({ id, status }) => `${id}_${status.toUpperCase()}`),
    ]);
  }

  return determineDisposition(state, protocol);
}

function insufficient(reasonCodes) {
  return {
    action: AgentAction.INSUFFICIENT_INFO,
    disposition: Disposition.INSUFFICIENT_INFORMATION,
    reasonCodes,
    policyVersion: POLICY_VERSION,
  };
}

function determineDisposition(state, protocol) {
  if (protocol.chiefComplaint === ChiefComplaint.CHEST_PAIN) {
    return {
      action: AgentAction.DISPOSITION,
      disposition: Disposition.URGENT_SAME_DAY,
      reasonCodes: ["CHEST_PAIN_NO_EMERGENCY_FLAG_BUT_REQUIRES_SAME_DAY_REVIEW"],
      policyVersion: POLICY_VERSION,
    };
  }

  const severity = state.symptoms.severity;
  if (severity >= 7) {
    return {
      action: AgentAction.DISPOSITION,
      disposition: Disposition.URGENT_SAME_DAY,
      reasonCodes: ["HEADACHE_HIGH_REPORTED_SEVERITY"],
      policyVersion: POLICY_VERSION,
    };
  }
  if (severity <= 3) {
    return {
      action: AgentAction.DISPOSITION,
      disposition: Disposition.SELF_MONITOR,
      reasonCodes: ["HEADACHE_LOW_SEVERITY_NO_PROTOCOL_RED_FLAGS"],
      policyVersion: POLICY_VERSION,
    };
  }
  return {
    action: AgentAction.DISPOSITION,
    disposition: Disposition.CLINIC_SOON,
    reasonCodes: ["HEADACHE_MODERATE_SEVERITY_NO_PROTOCOL_RED_FLAGS"],
    policyVersion: POLICY_VERSION,
  };
}

function askMore(question, reasonCodes) {
  return {
    action: AgentAction.ASK_MORE,
    disposition: null,
    reasonCodes,
    question,
    policyVersion: POLICY_VERSION,
  };
}
