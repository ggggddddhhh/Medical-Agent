import { SEMANTIC_SCHEMA_VERSION } from "../src/semantic/extraction-schema.js";

const K = (path, value, temporality = "current") => ({
  path, value, status: "known", confidence: 0.95, temporality, contradictionCandidate: false,
});
const U = (path, temporality = "unspecified") => ({
  path, value: null, status: "uncertain", confidence: 0.5, temporality, contradictionCandidate: false,
});
const A = (path, evidenceText, subject = "patient", polarity = "positive", certainty = "certain", temporality = "current", quote = false, hypothetical = false) => ({
  path, evidenceText, subject, polarity, certainty, temporality, quote, hypothetical,
});
const M = (path, value, status = "known", temporality = "current") => ({ path, value, status, temporality });
const H = (id, category, pathway, input, expectedFacts, options = {}) => ({
  id,
  category,
  pathway,
  input,
  expectedFacts,
  contextFacts: [],
  expectedUncertainties: options.expectedUncertainties ?? [],
  expectedConflicts: [],
  attributeExpectations: options.attributeExpectations ?? [],
  expectedMappings: options.expectedMappings ?? [],
  expectedClarifications: options.expectedClarifications ?? [],
  schemaVersion: SEMANTIC_SCHEMA_VERSION,
  holdout: true,
  exhaustive: true,
});

export const phase2a4BlindHoldoutCases = Object.freeze([
  H("P2A4-BLIND-EV-01", "evidence", "HEADACHE_V1", "脑袋突然剧痛，转眼便痛到顶峰。", [
    K("chiefComplaint.code", "headache"), K("symptoms.suddenOnset", true, "new_onset"),
    K("symptoms.onsetPattern", "sudden_severe", "new_onset"), K("symptoms.rapidPeak", true, "new_onset"),
  ], {
    attributeExpectations: [A("symptoms.rapidPeak", "转眼便痛到顶峰", "patient", "positive", "certain", "new_onset")],
    expectedMappings: [M("symptoms.rapidPeak", true, "known", "new_onset")],
  }),
  H("P2A4-BLIND-EV-02", "evidence", "HEADACHE_V1", "现在头痛，右手断电似的抬不起来。", [
    K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "右手断电")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true)],
  }),
  H("P2A4-BLIND-EV-03", "evidence", "HEADACHE_V1", "头疼并且全身滚烫，颈部硬得低不了头。", [
    K("chiefComplaint.code", "headache"), K("redFlags.feverNeckStiffness", true),
  ], {
    attributeExpectations: [
      A("redFlags.feverNeckStiffness", "全身滚烫"),
      A("redFlags.feverNeckStiffness", "颈部硬得低不了头"),
    ],
    expectedMappings: [M("redFlags.feverNeckStiffness", true)],
  }),
  H("P2A4-BLIND-EV-04", "evidence", "CHEST_PAIN_V1", "此刻胸痛，呼吸非常吃力。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", true),
  ], {
    attributeExpectations: [A("redFlags.difficultyBreathing", "呼吸非常吃力")],
    expectedMappings: [M("redFlags.difficultyBreathing", true)],
  }),
  H("P2A4-BLIND-EV-05", "evidence", "CHEST_PAIN_V1", "胸口像被绳子箍住，越收越紧。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true),
  ], {
    attributeExpectations: [A("redFlags.pressureOrCrushing", "像被绳子箍住")],
    expectedMappings: [M("redFlags.pressureOrCrushing", true)],
  }),
  H("P2A4-BLIND-EV-06", "evidence", "CHEST_PAIN_V1", "胸痛蔓延到后背和左肩。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.painRadiation", true),
  ], {
    attributeExpectations: [A("redFlags.painRadiation", "痛蔓延到后背和左肩")],
    expectedMappings: [M("redFlags.painRadiation", true)],
  }),

  H("P2A4-BLIND-SUB-01", "subject", "CHEST_PAIN_V1", "老婆现在胸痛，还觉得呼吸吃力。", [], {
    attributeExpectations: [A("redFlags.difficultyBreathing", "呼吸吃力", "other", "positive", "uncertain")],
  }),
  H("P2A4-BLIND-SUB-02", "subject", "HEADACHE_V1", "同学发现我现在头痛，左腿不听使唤。", [
    K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "左腿不听使唤")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true)],
  }),
  H("P2A4-BLIND-SUB-03", "subject", "CHEST_PAIN_V1", "是我本人胸疼，气总觉得不够使。", [
    K("chiefComplaint.code", "chest_pain"), U("redFlags.difficultyBreathing", "current"),
  ], {
    expectedUncertainties: ["redFlags.difficultyBreathing"],
    attributeExpectations: [A("redFlags.difficultyBreathing", "气总觉得不够使", "patient", "positive", "uncertain")],
    expectedMappings: [M("redFlags.difficultyBreathing", null, "uncertain")],
    expectedClarifications: ["redFlags.difficultyBreathing"],
  }),
  H("P2A4-BLIND-SUB-04", "subject", "HEADACHE_V1", "我也不知道是自己还是朋友头痛时嘴歪。", [
    U("redFlags.neurologicalDeficit"),
  ], {
    expectedUncertainties: ["redFlags.neurologicalDeficit"],
    attributeExpectations: [A("redFlags.neurologicalDeficit", "嘴歪", "unclear", "positive", "uncertain")],
    expectedMappings: [M("redFlags.neurologicalDeficit", null, "uncertain")],
    expectedClarifications: ["redFlags.neurologicalDeficit"],
  }),

  H("P2A4-BLIND-TIM-01", "temporality", "HEADACHE_V1", "五小时前头疼时右臂发麻。", [
    K("chiefComplaint.code", "headache", "previous"), K("redFlags.neurologicalDeficit", true, "previous"),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "右臂发麻", "patient", "positive", "certain", "previous")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true, "known", "previous")],
  }),
  H("P2A4-BLIND-TIM-02", "temporality", "CHEST_PAIN_V1", "今早胸痛放射到下颌，现在已经没有了。", [
    K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.painRadiation", true, "previous"),
    K("symptoms.activeNow", false, "resolved"),
  ], {
    attributeExpectations: [A("redFlags.painRadiation", "痛放射到下颌", "patient", "positive", "certain", "previous")],
    expectedMappings: [M("redFlags.painRadiation", true, "known", "previous")],
  }),
  H("P2A4-BLIND-TIM-03", "temporality", "CHEST_PAIN_V1", "眼下胸口疼，依旧气不够用。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", true),
  ], {
    attributeExpectations: [A("redFlags.difficultyBreathing", "气不够用")],
    expectedMappings: [M("redFlags.difficultyBreathing", true)],
  }),
  H("P2A4-BLIND-TIM-04", "temporality", "HEADACHE_V1", "头痛时左脚拖不动，但什么时候发生的记不清。", [
    U("redFlags.neurologicalDeficit"),
  ], {
    expectedUncertainties: ["redFlags.neurologicalDeficit"],
    attributeExpectations: [A("redFlags.neurologicalDeficit", "左脚拖不动", "patient", "positive", "uncertain", "unspecified")],
    expectedMappings: [M("redFlags.neurologicalDeficit", null, "uncertain", "unspecified")],
    expectedClarifications: ["redFlags.neurologicalDeficit"],
  }),

  H("P2A4-BLIND-CER-01", "certainty", "CHEST_PAIN_V1", "胸疼时约莫有些呼吸费劲。", [
    K("chiefComplaint.code", "chest_pain"), U("redFlags.difficultyBreathing"),
  ], {
    expectedUncertainties: ["redFlags.difficultyBreathing"],
    attributeExpectations: [A("redFlags.difficultyBreathing", "呼吸费劲", "patient", "positive", "uncertain")],
    expectedMappings: [M("redFlags.difficultyBreathing", null, "uncertain")],
    expectedClarifications: ["redFlags.difficultyBreathing"],
  }),
  H("P2A4-BLIND-CER-02", "certainty", "HEADACHE_V1", "头痛，我感觉右手像断了电。", [
    K("chiefComplaint.code", "headache"), U("redFlags.neurologicalDeficit"),
  ], {
    expectedUncertainties: ["redFlags.neurologicalDeficit"],
    attributeExpectations: [A("redFlags.neurologicalDeficit", "右手像断了电", "patient", "positive", "uncertain")],
    expectedMappings: [M("redFlags.neurologicalDeficit", null, "uncertain")],
    expectedClarifications: ["redFlags.neurologicalDeficit"],
  }),
  H("P2A4-BLIND-CER-03", "certainty", "CHEST_PAIN_V1", "我不敢肯定胸口是否像被门板顶住。", [
    U("redFlags.pressureOrCrushing"),
  ], {
    expectedUncertainties: ["redFlags.pressureOrCrushing"],
    attributeExpectations: [A("redFlags.pressureOrCrushing", "像被门板顶住", "patient", "positive", "uncertain")],
    expectedMappings: [M("redFlags.pressureOrCrushing", null, "uncertain")],
    expectedClarifications: ["redFlags.pressureOrCrushing"],
  }),
  H("P2A4-BLIND-CER-04", "certainty", "HEADACHE_V1", "我确实头疼，而且左脚现在拖不动。", [
    K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "左脚现在拖不动")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true)],
  }),

  H("P2A4-BLIND-NEG-01", "negation", "HEADACHE_V1", "头痛，但并无半边身体没劲。", [
    K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", false),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "半边身体没劲", "patient", "negative")],
    expectedMappings: [M("redFlags.neurologicalDeficit", false)],
  }),
  H("P2A4-BLIND-NEG-02", "negation", "CHEST_PAIN_V1", "胸痛并非像被铁箍勒住。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", false),
  ], {
    attributeExpectations: [A("redFlags.pressureOrCrushing", "像被铁箍勒住", "patient", "negative")],
    expectedMappings: [M("redFlags.pressureOrCrushing", false)],
  }),
  H("P2A4-BLIND-NEG-03", "negation", "CHEST_PAIN_V1", "有没有呼吸吃力我说不好。", [
    U("redFlags.difficultyBreathing"),
  ], {
    expectedUncertainties: ["redFlags.difficultyBreathing"],
    attributeExpectations: [A("redFlags.difficultyBreathing", "呼吸吃力", "patient", "positive", "uncertain")],
    expectedMappings: [M("redFlags.difficultyBreathing", null, "uncertain")],
    expectedClarifications: ["redFlags.difficultyBreathing"],
  }),

  H("P2A4-BLIND-MIX-01", "mixed", "CHEST_PAIN_V1", "前天胸痛蔓延到右肩，接着晕倒冒冷汗。", [
    K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.painRadiation", true, "previous"),
    K("redFlags.collapseOrSweating", true, "previous"),
  ], {
    attributeExpectations: [
      A("redFlags.painRadiation", "痛蔓延到右肩", "patient", "positive", "certain", "previous"),
      A("redFlags.collapseOrSweating", "晕倒", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [
      M("redFlags.painRadiation", true, "known", "previous"),
      M("redFlags.collapseOrSweating", true, "known", "previous"),
    ],
  }),
  H("P2A4-BLIND-MIX-02", "mixed", "CHEST_PAIN_V1", "目前胸口像被皮带勒住，同时呼吸吃力。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true),
    K("redFlags.difficultyBreathing", true),
  ], {
    attributeExpectations: [
      A("redFlags.pressureOrCrushing", "像被皮带勒住"),
      A("redFlags.difficultyBreathing", "呼吸吃力"),
    ],
    expectedMappings: [M("redFlags.pressureOrCrushing", true), M("redFlags.difficultyBreathing", true)],
  }),
  H("P2A4-BLIND-MIX-03", "mixed", "HEADACHE_V1", "室友假设她突然头痛并且右手断电，我只是转述问题。", [], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "右手断电", "other", "positive", "certain", "new_onset", false, true)],
  }),
]);
