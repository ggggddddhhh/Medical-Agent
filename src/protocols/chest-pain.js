export const chestPainProtocol = Object.freeze({
  code: "CHEST_PAIN_V1",
  chiefComplaint: "chest_pain",
  version: "1.0.0",
  displayName: "胸痛",
  aliases: ["胸痛", "胸口痛", "胸疼", "心口痛", "chest pain"],
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
});
