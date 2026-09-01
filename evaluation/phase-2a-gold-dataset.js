import { SEMANTIC_SCHEMA_VERSION } from "../src/semantic/extraction-schema.js";

const K = (path, value, temporality = "unspecified", options = {}) => ({
  path,
  value,
  status: "known",
  confidence: options.confidence ?? 0.95,
  temporality,
  contradictionCandidate: options.contradictionCandidate ?? false,
});
const U = (path, status = "unknown") => ({
  path,
  value: null,
  status,
  confidence: status === "uncertain" ? 0.5 : 1,
  temporality: "unspecified",
  contradictionCandidate: false,
});
const C = (path, values) => ({
  path,
  value: values,
  status: "conflicting",
  confidence: 0.5,
  temporality: "unspecified",
  contradictionCandidate: true,
});

const testCase = (value) => ({
  contextFacts: [],
  expectedFacts: [],
  expectedUnknownFacts: [],
  expectedNegations: [],
  expectedUncertainties: [],
  expectedConflicts: [],
  ...value,
  schemaVersion: SEMANTIC_SCHEMA_VERSION,
});

export const phase2aGoldDataset = Object.freeze([
  testCase({
    id: "H-GOLD-01", category: "standard", pathway: "HEADACHE_V1",
    input: "我头痛两个小时，现在大概5分。",
    expectedFacts: [K("chiefComplaint.code", "headache"), K("symptoms.durationMinutes", 120, "current"), K("symptoms.severity", 5, "current")],
    expectedUnknownFacts: ["redFlags.neurologicalDeficit"],
  }),
  testCase({
    id: "H-GOLD-02", category: "colloquial", pathway: "HEADACHE_V1",
    input: "脑壳疼得凶，差不多7分。",
    expectedFacts: [K("chiefComplaint.code", "headache"), K("symptoms.severity", 7, "current")],
    expectedUnknownFacts: ["symptoms.onsetPattern"],
  }),
  testCase({
    id: "H-GOLD-03", category: "incomplete", pathway: "HEADACHE_V1",
    input: "头疼。", expectedFacts: [K("chiefComplaint.code", "headache")],
    expectedUnknownFacts: ["symptoms.severity", "redFlags.neurologicalDeficit"],
  }),
  testCase({
    id: "H-GOLD-04", category: "typo_negation", pathway: "HEADACHE_V1",
    input: "头痛，没嘴歪，也没说化不清。",
    expectedFacts: [K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", false, "current")],
    expectedNegations: ["redFlags.neurologicalDeficit"],
    expectedUnknownFacts: ["redFlags.alteredConsciousness"],
  }),
  testCase({
    id: "H-GOLD-05", category: "uncertainty", pathway: "HEADACHE_V1",
    input: "好像嘴有一点歪，我也不太确定。",
    expectedFacts: [U("redFlags.neurologicalDeficit", "uncertain")],
    expectedUncertainties: ["redFlags.neurologicalDeficit"],
    expectedUnknownFacts: ["redFlags.alteredConsciousness"],
  }),
  testCase({
    id: "H-GOLD-06", category: "correction", pathway: "HEADACHE_V1",
    contextFacts: [K("symptoms.onsetPattern", "gradual", "new_onset")],
    input: "我想起来了，其实是突然开始的，几秒就很痛。",
    expectedFacts: [
      K("symptoms.onsetPattern", "sudden_severe", "new_onset", { contradictionCandidate: true }),
      K("symptoms.suddenOnset", true, "new_onset", { contradictionCandidate: true }),
      K("symptoms.rapidPeak", true, "new_onset"),
    ],
    expectedConflicts: ["symptoms.onsetPattern"],
    expectedUnknownFacts: ["redFlags.neurologicalDeficit"],
  }),
  testCase({
    id: "H-GOLD-07", category: "conflicting", pathway: "HEADACHE_V1",
    input: "一开始我说是慢慢疼，但又觉得其实是突然一下就很痛。",
    expectedFacts: [C("symptoms.onsetPattern", ["gradual", "sudden_severe"])],
    expectedConflicts: ["symptoms.onsetPattern"],
    expectedUnknownFacts: ["redFlags.neurologicalDeficit"],
  }),
  testCase({
    id: "H-GOLD-08", category: "metaphor", pathway: "HEADACHE_V1",
    input: "脑袋快炸了，但疼痛是慢慢加重的。",
    expectedFacts: [K("chiefComplaint.code", "headache"), K("symptoms.onsetPattern", "gradual", "current")],
    expectedUnknownFacts: ["symptoms.severity"],
  }),
  testCase({
    id: "H-GOLD-09", category: "temporality_resolved", pathway: "HEADACHE_V1",
    input: "昨天头痛过，现在已经不疼了。",
    expectedFacts: [K("chiefComplaint.code", "headache", "previous"), K("symptoms.activeNow", false, "resolved")],
    expectedNegations: ["symptoms.activeNow"], expectedUnknownFacts: ["symptoms.severity"],
  }),
  testCase({
    id: "H-GOLD-10", category: "refusal", pathway: "HEADACHE_V1",
    input: "头怎么开始的我不想回答。",
    expectedFacts: [K("chiefComplaint.code", "headache"), U("symptoms.onsetPattern", "refused")],
    expectedUnknownFacts: ["symptoms.severity"],
  }),
  testCase({
    id: "H-GOLD-11", category: "explicit_unknown", pathway: "HEADACHE_V1",
    input: "我不确定是不是突然开始的。",
    expectedFacts: [U("symptoms.onsetPattern", "uncertain")],
    expectedUncertainties: ["symptoms.onsetPattern"],
    expectedUnknownFacts: ["redFlags.neurologicalDeficit"],
  }),
  testCase({
    id: "H-GOLD-12", category: "hallucination_guard", pathway: "HEADACHE_V1",
    input: "我头痛两个小时。",
    expectedFacts: [K("chiefComplaint.code", "headache"), K("symptoms.durationMinutes", 120, "current")],
    expectedUnknownFacts: ["redFlags.neurologicalDeficit", "redFlags.feverNeckStiffness", "relevantHistory.priorSimilarEpisode"],
  }),
  testCase({
    id: "C-GOLD-01", category: "standard", pathway: "CHEST_PAIN_V1",
    input: "胸痛五分钟了，现在还在痛。",
    expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("symptoms.durationMinutes", 5, "current"), K("symptoms.activeNow", true, "current")],
    expectedUnknownFacts: ["redFlags.difficultyBreathing"],
  }),
  testCase({
    id: "C-GOLD-02", category: "colloquial_pressure", pathway: "CHEST_PAIN_V1",
    input: "胸前勒得慌，像压了块大石头。",
    expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true, "current")],
    expectedUnknownFacts: ["redFlags.painRadiation"],
  }),
  testCase({
    id: "C-GOLD-03", category: "incomplete", pathway: "CHEST_PAIN_V1",
    input: "胸口不舒服。", expectedFacts: [K("chiefComplaint.code", "chest_pain")],
    expectedUnknownFacts: ["redFlags.difficultyBreathing", "symptoms.activeNow"],
  }),
  testCase({
    id: "C-GOLD-04", category: "typo_negation", pathway: "CHEST_PAIN_V1",
    input: "胸疼，但没觉得喘不过汽。",
    expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", false, "current")],
    expectedNegations: ["redFlags.difficultyBreathing"],
    expectedUnknownFacts: ["redFlags.collapseOrSweating"],
  }),
  testCase({
    id: "C-GOLD-05", category: "uncertainty", pathway: "CHEST_PAIN_V1",
    input: "好像有点喘不过气，但我不确定。",
    expectedFacts: [U("redFlags.difficultyBreathing", "uncertain")],
    expectedUncertainties: ["redFlags.difficultyBreathing"],
    expectedUnknownFacts: ["redFlags.pressureOrCrushing"],
  }),
  testCase({
    id: "C-GOLD-06", category: "temporality_resolved", pathway: "CHEST_PAIN_V1",
    input: "昨天胸疼，现在已经不疼了。",
    expectedFacts: [K("chiefComplaint.code", "chest_pain", "previous"), K("symptoms.activeNow", false, "resolved")],
    expectedNegations: ["symptoms.activeNow"], expectedUnknownFacts: ["redFlags.difficultyBreathing"],
  }),
  testCase({
    id: "C-GOLD-07", category: "chronic", pathway: "CHEST_PAIN_V1",
    input: "胸口这样反复三个月了，今天也有。",
    expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("symptoms.activeNow", true, "current")],
    expectedUnknownFacts: ["redFlags.pressureOrCrushing"],
  }),
  testCase({
    id: "C-GOLD-08", category: "correction", pathway: "CHEST_PAIN_V1",
    contextFacts: [K("redFlags.difficultyBreathing", false, "previous")],
    input: "更正一下，刚才其实有喘不过气。",
    expectedFacts: [K("redFlags.difficultyBreathing", true, "previous", { contradictionCandidate: true })],
    expectedConflicts: ["redFlags.difficultyBreathing"],
    expectedUnknownFacts: ["redFlags.pressureOrCrushing"],
  }),
  testCase({
    id: "C-GOLD-09", category: "conflicting", pathway: "CHEST_PAIN_V1",
    input: "我没晕过——等等，刚才好像确实晕了一下。",
    expectedFacts: [C("redFlags.collapseOrSweating", [false, true])],
    expectedConflicts: ["redFlags.collapseOrSweating"],
    expectedUnknownFacts: ["redFlags.difficultyBreathing"],
  }),
  testCase({
    id: "C-GOLD-10", category: "negation", pathway: "CHEST_PAIN_V1",
    input: "胸痛，但没晕过，也没有冷汗。",
    expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("redFlags.collapseOrSweating", false, "current")],
    expectedNegations: ["redFlags.collapseOrSweating"],
    expectedUnknownFacts: ["redFlags.difficultyBreathing"],
  }),
  testCase({
    id: "C-GOLD-11", category: "explicit_unknown", pathway: "CHEST_PAIN_V1",
    input: "是不是压榨感我说不准。",
    expectedFacts: [U("redFlags.pressureOrCrushing", "unknown")],
    expectedUnknownFacts: ["redFlags.pressureOrCrushing", "redFlags.difficultyBreathing"],
  }),
  testCase({
    id: "C-GOLD-12", category: "hallucination_guard", pathway: "CHEST_PAIN_V1",
    input: "我胸痛两个小时。",
    expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("symptoms.durationMinutes", 120, "current")],
    expectedUnknownFacts: ["redFlags.difficultyBreathing", "redFlags.collapseOrSweating", "relevantHistory.cardiovascularDisease"],
  }),
]);

export const phase2aSemanticSentinels = Object.freeze([
  testCase({ id: "H-SENT-01", sentinel: true, pathway: "HEADACHE_V1", input: "我的头刚才突然像炸了一样，几秒钟疼到最厉害。", expectedFacts: [K("chiefComplaint.code", "headache"), K("symptoms.suddenOnset", true, "new_onset"), K("symptoms.rapidPeak", true, "new_onset")], expectedUnknownFacts: ["redFlags.neurologicalDeficit"] }),
  testCase({ id: "H-SENT-02", sentinel: true, pathway: "HEADACHE_V1", input: "头痛以后右边胳膊突然没劲，说话也不清楚。", expectedFacts: [K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true, "new_onset")], expectedUnknownFacts: ["redFlags.alteredConsciousness"] }),
  testCase({ id: "H-SENT-03", sentinel: true, pathway: "HEADACHE_V1", input: "头痛时人昏过去了，刚叫醒。", expectedFacts: [K("chiefComplaint.code", "headache"), K("redFlags.alteredConsciousness", true, "previous")], expectedUnknownFacts: ["redFlags.neurologicalDeficit"] }),
  testCase({ id: "H-SENT-04", sentinel: true, pathway: "HEADACHE_V1", input: "头痛还发高烧，脖子硬得低不下去。", expectedFacts: [K("chiefComplaint.code", "headache"), K("redFlags.feverNeckStiffness", true, "current")], expectedUnknownFacts: ["redFlags.recentHeadTrauma"] }),
  testCase({ id: "C-SENT-01", sentinel: true, pathway: "CHEST_PAIN_V1", input: "胸口像被大石头死死压住，现在一直很痛。", expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true, "current"), K("symptoms.persistentSevere", true, "current")], expectedUnknownFacts: ["redFlags.difficultyBreathing"] }),
  testCase({ id: "C-SENT-02", sentinel: true, pathway: "CHEST_PAIN_V1", input: "胸痛，喘不上气，感觉吸不到空气。", expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", true, "current")], expectedUnknownFacts: ["redFlags.painRadiation"] }),
  testCase({ id: "C-SENT-03", sentinel: true, pathway: "CHEST_PAIN_V1", input: "胸疼的时候刚才晕过去了，还出了一身冷汗。", expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("redFlags.collapseOrSweating", true, "previous")], expectedUnknownFacts: ["redFlags.difficultyBreathing"] }),
  testCase({ id: "C-SENT-04", sentinel: true, pathway: "CHEST_PAIN_V1", input: "胸痛一直不缓解，还窜到左胳膊和下巴。", expectedFacts: [K("chiefComplaint.code", "chest_pain"), K("symptoms.persistentSevere", true, "current"), K("redFlags.painRadiation", true, "current")], expectedUnknownFacts: ["redFlags.difficultyBreathing"] }),
]);

export function expectedEnvelope(item) {
  return {
    schemaVersion: SEMANTIC_SCHEMA_VERSION,
    pathway: item.pathway,
    facts: structuredClone(item.expectedFacts),
  };
}
