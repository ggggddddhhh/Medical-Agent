import { AgentAction, Disposition, POLICY_VERSION } from "../domain/constants.js";
import { isNegated } from "./extraction-helpers.js";

export const chestPainProtocol = Object.freeze({
  code: "CHEST_PAIN_V1",
  chiefComplaint: "chest_pain",
  version: "1.0.0",
  displayName: "胸痛",
  aliases: ["胸痛", "胸口痛", "胸疼", "心口痛", "chest pain"],
  semanticFactSchema: Object.freeze({
    "chiefComplaint.code": { type: "enum", values: ["chest_pain"] },
    "symptoms.onsetPattern": {
      type: "enum",
      values: ["sudden", "gradual"],
    },
    "symptoms.durationMinutes": { type: "number", minimum: 0 },
    "symptoms.severity": { type: "integer", minimum: 0, maximum: 10 },
    "symptoms.activeNow": { type: "boolean" },
    "symptoms.persistentSevere": { type: "boolean" },
    "redFlags.difficultyBreathing": { type: "boolean" },
    "redFlags.pressureOrCrushing": { type: "boolean" },
    "redFlags.painRadiation": { type: "boolean" },
    "redFlags.collapseOrSweating": { type: "boolean" },
    "relevantHistory.cardiovascularDisease": { type: "boolean" },
    "relevantHistory.priorSimilarEpisode": { type: "boolean" },
  }),
  questions: [
    {
      id: "CHEST_PAIN_BREATHING",
      factPath: "redFlags.difficultyBreathing",
      parser: "boolean",
      text: "胸痛时有没有呼吸困难、喘不上气或明显憋气？",
    },
    {
      id: "CHEST_PAIN_PRESSURE",
      factPath: "redFlags.pressureOrCrushing",
      parser: "boolean",
      text: "疼痛是否像压榨、重物压住或紧缩感？",
    },
    {
      id: "CHEST_PAIN_RADIATION",
      factPath: "redFlags.painRadiation",
      parser: "boolean",
      text: "疼痛有没有扩散到手臂、肩背、颈部或下颌？",
    },
    {
      id: "CHEST_PAIN_COLLAPSE",
      factPath: "redFlags.collapseOrSweating",
      parser: "boolean",
      text: "有没有晕厥、接近晕倒、冷汗或明显恶心？",
    },
    {
      id: "CHEST_PAIN_ACTIVE",
      factPath: "symptoms.activeNow",
      parser: "boolean",
      text: "胸痛现在是否仍在持续，或者今天反复出现？",
    },
  ],
  emergencyRules: [
    {
      id: "CHEST_PAIN_WITH_DYSPNEA",
      when: (state) => state.redFlags.difficultyBreathing === true,
    },
    {
      id: "CHEST_PAIN_PRESSURE_OR_CRUSHING",
      when: (state) => state.redFlags.pressureOrCrushing === true,
    },
    {
      id: "CHEST_PAIN_RADIATION",
      when: (state) => state.redFlags.painRadiation === true,
    },
    {
      id: "CHEST_PAIN_COLLAPSE_OR_SWEATING",
      when: (state) => state.redFlags.collapseOrSweating === true,
    },
  ],
  extractDeterministicFacts(text) {
    const facts = { symptoms: {}, redFlags: {} };
    if (
      /(喘不上|喘不过|呼吸困难|明显憋气|无法呼吸)/.test(text) &&
      !isNegated(text, "喘不上|喘不过|呼吸困难|憋气|无法呼吸")
    ) {
      facts.redFlags.difficultyBreathing = true;
    }
    if (
      /(石头|重物).*(压|压着)|压.*(石头|重物)|压榨|紧缩|胸口.*发紧|胸.*压迫/.test(text) &&
      !isNegated(text, "石头|重物|压榨|紧缩|发紧|压迫")
    ) {
      facts.redFlags.pressureOrCrushing = true;
    }
    if (
      /(疼|痛).*(扩散|放射|窜到).*(手臂|胳膊|肩|背|颈|脖子|下颌|牙)|(?:手臂|胳膊|肩背|下颌).*(也痛|也疼)/.test(text) &&
      !isNegated(text, "扩散|放射|窜到|手臂|胳膊|肩背|下颌")
    ) {
      facts.redFlags.painRadiation = true;
    }
    if (
      /(晕厥|晕倒|快要晕|差点晕|险些晕|冷汗|大汗|濒死感)/.test(text) &&
      !isNegated(text, "晕厥|晕倒|快要晕|差点晕|险些晕|冷汗|大汗|濒死感")
    ) {
      facts.redFlags.collapseOrSweating = true;
    }
    return facts;
  },
  determineDisposition() {
    return {
      action: AgentAction.DISPOSITION,
      disposition: Disposition.URGENT_SAME_DAY,
      reasonCodes: ["CHEST_PAIN_NO_EMERGENCY_FLAG_BUT_REQUIRES_SAME_DAY_REVIEW"],
      policyVersion: POLICY_VERSION,
    };
  },
  department: "急诊科或心血管内科",
  warning:
    "如胸痛持续、加重，或出现呼吸困难、晕厥、冷汗、放射痛，请立即联系急救服务。",
});
