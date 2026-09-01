export const AgentAction = Object.freeze({
  ASK_MORE: "ASK_MORE",
  CALL_TOOL: "CALL_TOOL",
  DISPOSITION: "DISPOSITION",
  SAFETY_ESCALATION: "SAFETY_ESCALATION",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
  INSUFFICIENT_INFO: "INSUFFICIENT_INFO",
});

export const Disposition = Object.freeze({
  EMERGENCY_NOW: "EMERGENCY_NOW",
  URGENT_SAME_DAY: "URGENT_SAME_DAY",
  CLINIC_SOON: "CLINIC_SOON",
  SELF_MONITOR: "SELF_MONITOR",
  INSUFFICIENT_INFORMATION: "INSUFFICIENT_INFORMATION",
});

export const ChiefComplaint = Object.freeze({
  HEADACHE: "headache",
  CHEST_PAIN: "chest_pain",
});

export const POLICY_VERSION = "triage-policy-0.1.0";
export const BASELINE_MODEL_VERSION = "deterministic-baseline-0.1.0";
