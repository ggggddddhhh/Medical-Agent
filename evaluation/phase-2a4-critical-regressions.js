import { SEMANTIC_SCHEMA_VERSION } from "../src/semantic/extraction-schema.js";

const K = (path, value, temporality = "current") => ({
  path,
  value,
  status: "known",
  confidence: 0.95,
  temporality,
  contradictionCandidate: false,
});
const U = (path, temporality = "unspecified") => ({
  path,
  value: null,
  status: "uncertain",
  confidence: 0.5,
  temporality,
  contradictionCandidate: false,
});
const A = (
  path,
  evidenceText,
  subject = "patient",
  polarity = "positive",
  certainty = "certain",
  temporality = "current",
) => ({ path, evidenceText, subject, polarity, certainty, temporality, quote: false, hypothetical: false });
const M = (path, value, status = "known", temporality = "current") => ({
  path, value, status, temporality,
});
const R = (id, category, pathway, input, expectedFacts, options = {}) => ({
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
  exhaustive: true,
});

export const phase2a4CriticalRegressions = Object.freeze([
  R("P2A4-REG-EV-01", "evidence", "HEADACHE_V1", "脑袋突然疼起来，一眨眼就痛到最狠。", [
    K("chiefComplaint.code", "headache"), K("symptoms.suddenOnset", true, "new_onset"),
    K("symptoms.onsetPattern", "sudden_severe", "new_onset"), K("symptoms.rapidPeak", true, "new_onset"),
  ], {
    attributeExpectations: [A("symptoms.rapidPeak", "一眨眼就痛到最狠", "patient", "positive", "certain", "new_onset")],
    expectedMappings: [M("symptoms.rapidPeak", true, "known", "new_onset")],
  }),
  R("P2A4-REG-EV-02", "evidence", "HEADACHE_V1", "现在头疼，右胳膊不听使唤。", [
    K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "右胳膊不听使唤")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true)],
  }),
  R("P2A4-REG-EV-03", "evidence", "HEADACHE_V1", "头疼，左手发嘛还拿不稳东西。", [
    K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "左手发嘛还拿不稳")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true)],
  }),
  R("P2A4-REG-EV-04", "evidence", "HEADACHE_V1", "现在头痛，浑身发烫，脖颈像焊住一样动不了。", [
    K("chiefComplaint.code", "headache"), K("redFlags.feverNeckStiffness", true),
  ], {
    attributeExpectations: [
      A("redFlags.feverNeckStiffness", "浑身发烫"),
      A("redFlags.feverNeckStiffness", "脖颈像焊住一样动不了"),
    ],
    expectedMappings: [M("redFlags.feverNeckStiffness", true)],
  }),
  R("P2A4-REG-EV-05", "evidence", "CHEST_PAIN_V1", "胸口疼，气怎么也不够用。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", true),
  ], {
    attributeExpectations: [A("redFlags.difficultyBreathing", "气怎么也不够用")],
    expectedMappings: [M("redFlags.difficultyBreathing", true)],
  }),
  R("P2A4-REG-EV-06", "evidence", "CHEST_PAIN_V1", "胸疼，像被铁箍勒住。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true),
  ], {
    attributeExpectations: [A("redFlags.pressureOrCrushing", "像被铁箍勒住")],
    expectedMappings: [M("redFlags.pressureOrCrushing", true)],
  }),
  R("P2A4-REG-EV-07", "evidence", "CHEST_PAIN_V1", "胸痛串到后背和右肩。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.painRadiation", true),
  ], {
    attributeExpectations: [A("redFlags.painRadiation", "痛串到后背和右肩")],
    expectedMappings: [M("redFlags.painRadiation", true)],
  }),
  R("P2A4-REG-EV-08", "evidence", "CHEST_PAIN_V1", "胸口痛得人一下软倒，额头全是汗。", [
    K("chiefComplaint.code", "chest_pain", "new_onset"), K("redFlags.collapseOrSweating", true, "previous"),
  ], {
    attributeExpectations: [A("redFlags.collapseOrSweating", "人一下软倒", "patient", "positive", "certain", "previous")],
    expectedMappings: [M("redFlags.collapseOrSweating", true, "known", "previous")],
  }),

  R("P2A4-REG-SUB-01", "subject", "CHEST_PAIN_V1", "我替父亲问，他胸口像铁箍勒住。", [], {
    attributeExpectations: [A("redFlags.pressureOrCrushing", "像铁箍勒住", "other")],
  }),
  R("P2A4-REG-SUB-02", "subject", "HEADACHE_V1", "室友说她现在头疼，左手不听使唤。", [], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "左手不听使唤", "other")],
  }),
  R("P2A4-REG-SUB-03", "subject", "HEADACHE_V1", "同事看见我现在头痛，右腿拖不动。", [
    K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "右腿拖不动")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true)],
  }),
  R("P2A4-REG-SUB-04", "subject", "CHEST_PAIN_V1", "不清楚是我还是家人胸口像被箍住。", [
    U("redFlags.pressureOrCrushing"),
  ], {
    expectedUncertainties: ["redFlags.pressureOrCrushing"],
    attributeExpectations: [A("redFlags.pressureOrCrushing", "像被箍住", "unclear", "positive", "uncertain")],
    expectedMappings: [M("redFlags.pressureOrCrushing", null, "uncertain")],
    expectedClarifications: ["redFlags.pressureOrCrushing"],
  }),

  R("P2A4-REG-TIM-01", "temporality", "HEADACHE_V1", "三天前头疼时左手发麻。", [
    K("chiefComplaint.code", "headache", "previous"), K("redFlags.neurologicalDeficit", true, "previous"),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "左手发麻", "patient", "positive", "certain", "previous")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true, "known", "previous")],
  }),
  R("P2A4-REG-TIM-02", "temporality", "CHEST_PAIN_V1", "前天胸痛放射到右臂。", [
    K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.painRadiation", true, "previous"),
  ], {
    attributeExpectations: [A("redFlags.painRadiation", "痛放射到右臂", "patient", "positive", "certain", "previous")],
    expectedMappings: [M("redFlags.painRadiation", true, "known", "previous")],
  }),
  R("P2A4-REG-TIM-03", "temporality", "CHEST_PAIN_V1", "上个月胸疼时晕倒过。", [
    K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.collapseOrSweating", true, "previous"),
  ], {
    attributeExpectations: [A("redFlags.collapseOrSweating", "晕倒", "patient", "positive", "certain", "previous")],
    expectedMappings: [M("redFlags.collapseOrSweating", true, "known", "previous")],
  }),
  R("P2A4-REG-TIM-04", "temporality", "CHEST_PAIN_V1", "这会儿胸口疼，仍然喘不过来。", [
    K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", true),
  ], {
    attributeExpectations: [A("redFlags.difficultyBreathing", "喘不过来")],
    expectedMappings: [M("redFlags.difficultyBreathing", true)],
  }),
  R("P2A4-REG-TIM-05", "temporality", "CHEST_PAIN_V1", "胸口像铁箍勒着，但记不清是现在还是以前。", [
    U("redFlags.pressureOrCrushing"),
  ], {
    expectedUncertainties: ["redFlags.pressureOrCrushing"],
    attributeExpectations: [A("redFlags.pressureOrCrushing", "像铁箍勒着", "patient", "positive", "uncertain", "unspecified")],
    expectedMappings: [M("redFlags.pressureOrCrushing", null, "uncertain", "unspecified")],
    expectedClarifications: ["redFlags.pressureOrCrushing"],
  }),

  R("P2A4-REG-CER-01", "certainty", "HEADACHE_V1", "现在头疼，可能左腿拖不动。", [
    K("chiefComplaint.code", "headache"), U("redFlags.neurologicalDeficit", "current"),
  ], {
    expectedUncertainties: ["redFlags.neurologicalDeficit"],
    attributeExpectations: [A("redFlags.neurologicalDeficit", "左腿拖不动", "patient", "positive", "uncertain", "current")],
    expectedMappings: [M("redFlags.neurologicalDeficit", null, "uncertain", "current")],
    expectedClarifications: ["redFlags.neurologicalDeficit"],
  }),
  R("P2A4-REG-CER-02", "certainty", "HEADACHE_V1", "说不好是不是浑身发烫、脖子硬。", [U("redFlags.feverNeckStiffness")], {
    expectedUncertainties: ["redFlags.feverNeckStiffness"],
    attributeExpectations: [
      A("redFlags.feverNeckStiffness", "浑身发烫", "patient", "positive", "uncertain"),
      A("redFlags.feverNeckStiffness", "脖子硬", "patient", "positive", "uncertain"),
    ],
    expectedMappings: [M("redFlags.feverNeckStiffness", null, "uncertain")],
    expectedClarifications: ["redFlags.feverNeckStiffness"],
  }),
  R("P2A4-REG-CER-03", "certainty", "CHEST_PAIN_V1", "胸疼，我怀疑有点呼吸费劲。", [
    K("chiefComplaint.code", "chest_pain"), U("redFlags.difficultyBreathing"),
  ], {
    expectedUncertainties: ["redFlags.difficultyBreathing"],
    attributeExpectations: [A("redFlags.difficultyBreathing", "呼吸费劲", "patient", "positive", "uncertain")],
    expectedMappings: [M("redFlags.difficultyBreathing", null, "uncertain")],
    expectedClarifications: ["redFlags.difficultyBreathing"],
  }),
  R("P2A4-REG-CER-04", "certainty", "CHEST_PAIN_V1", "胸口大概像被皮带勒着。", [U("redFlags.pressureOrCrushing")], {
    expectedUncertainties: ["redFlags.pressureOrCrushing"],
    attributeExpectations: [A("redFlags.pressureOrCrushing", "像被皮带勒着", "patient", "positive", "uncertain")],
    expectedMappings: [M("redFlags.pressureOrCrushing", null, "uncertain")],
    expectedClarifications: ["redFlags.pressureOrCrushing"],
  }),
  R("P2A4-REG-CER-05", "certainty", "CHEST_PAIN_V1", "胸痛后像是人软倒了，但我不敢肯定。", [
    K("chiefComplaint.code", "chest_pain"), U("redFlags.collapseOrSweating", "previous"),
  ], {
    expectedUncertainties: ["redFlags.collapseOrSweating"],
    attributeExpectations: [A("redFlags.collapseOrSweating", "人软倒", "patient", "positive", "uncertain", "previous")],
    expectedMappings: [M("redFlags.collapseOrSweating", null, "uncertain", "previous")],
    expectedClarifications: ["redFlags.collapseOrSweating"],
  }),

  R("P2A4-REG-MIX-01", "mixed", "HEADACHE_V1", "脑袋疼，身体烫得像火炉，脖子跟生锈一样转不动。", [
    K("chiefComplaint.code", "headache"), K("redFlags.feverNeckStiffness", true),
  ], {
    attributeExpectations: [
      A("redFlags.feverNeckStiffness", "身体烫得像火炉"),
      A("redFlags.feverNeckStiffness", "脖子跟生锈一样转不动"),
    ],
    expectedMappings: [M("redFlags.feverNeckStiffness", true)],
  }),
  R("P2A4-REG-MIX-02", "mixed", "CHEST_PAIN_V1", "胸口像被带子捆紧，气只够吸半口，随后瘫倒冒冷汗。", [
    K("redFlags.pressureOrCrushing", true), K("redFlags.difficultyBreathing", true),
    K("redFlags.collapseOrSweating", true, "previous"),
  ], {
    attributeExpectations: [
      A("redFlags.pressureOrCrushing", "像被带子捆紧"),
      A("redFlags.difficultyBreathing", "气只够吸半口"),
      A("redFlags.collapseOrSweating", "瘫倒", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [
      M("redFlags.pressureOrCrushing", true), M("redFlags.difficultyBreathing", true),
      M("redFlags.collapseOrSweating", true, "known", "previous"),
    ],
  }),
]);
