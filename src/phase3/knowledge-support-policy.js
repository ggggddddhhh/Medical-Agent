import { AgentAction, Disposition } from "../domain/constants.js";

export const KNOWLEDGE_SUPPORT_POLICY_VERSION = "knowledge-support-policy-0.1.0";

export class KnowledgeSupportPolicy {
  createRequest({ decision, caseState } = {}) {
    if (
      decision?.action !== AgentAction.DISPOSITION ||
      decision.disposition === Disposition.EMERGENCY_NOW ||
      decision.disposition === Disposition.INSUFFICIENT_INFORMATION
    ) {
      return null;
    }
    const topic = caseState?.chiefComplaint?.code;
    if (!new Set(["headache", "chest_pain"]).has(topic)) return null;
    return {
      topic,
      intent: "health_education",
      limit: 2,
    };
  }
}
