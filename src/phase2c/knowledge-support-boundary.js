export const KNOWLEDGE_SUPPORT_BOUNDARY_VERSION = "knowledge-support-boundary-0.1.0";

export const FUTURE_LIGHTRAG_BOUNDARY = Object.freeze({
  enabled: false,
  allowedOutputs: Object.freeze([
    "generalMedicalExplanation",
    "sourceCitations",
  ]),
  forbiddenOutputs: Object.freeze([
    "riskLevel",
    "disposition",
    "action",
    "reasonCodes",
    "caseStateMutation",
    "clinicalFactAssertion",
  ]),
});
