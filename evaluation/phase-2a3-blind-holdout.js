import { SEMANTIC_SCHEMA_VERSION } from "../src/semantic/extraction-schema.js";

const K = (path, value, temporality = "unspecified", contradictionCandidate = false) => ({
  path,
  value,
  status: "known",
  confidence: 0.95,
  temporality,
  contradictionCandidate,
});
const U = (path, temporality = "unspecified") => ({
  path,
  value: null,
  status: "uncertain",
  confidence: 0.5,
  temporality,
  contradictionCandidate: false,
});
const C = (path, values, temporality = "unspecified") => ({
  path,
  value: values,
  status: "conflicting",
  confidence: 0.5,
  temporality,
  contradictionCandidate: true,
});
const A = (
  path,
  evidenceText,
  subject = "patient",
  polarity = "positive",
  certainty = "certain",
  temporality = "current",
  quote = false,
  hypothetical = false,
) => ({ path, evidenceText, subject, polarity, certainty, temporality, quote, hypothetical });
const M = (path, value, status = "known", temporality = undefined) => ({
  path,
  value,
  status,
  ...(temporality ? { temporality } : {}),
});
const H = (id, category, pathway, input, expectedFacts, options = {}) => ({
  id,
  category,
  pathway,
  input,
  expectedFacts,
  contextFacts: options.contextFacts ?? [],
  expectedUncertainties: options.expectedUncertainties ?? [],
  expectedConflicts: options.expectedConflicts ?? [],
  attributeExpectations: options.attributeExpectations ?? [],
  expectedMappings: options.expectedMappings ?? [],
  expectedClarifications: options.expectedClarifications ?? [],
  schemaVersion: SEMANTIC_SCHEMA_VERSION,
  holdout: true,
  exhaustive: true,
});

export const phase2a3BlindHoldoutCases = Object.freeze([
  H("P2A3-COL-01", "colloquial", "HEADACHE_V1", "我脑袋疼，像有人突然拿铁锤砸了一下，眨眼就疼到极点。", [
    K("chiefComplaint.code", "headache"),
    K("symptoms.suddenOnset", true, "new_onset"),
    K("symptoms.rapidPeak", true, "new_onset"),
  ], {
    attributeExpectations: [
      A("symptoms.suddenOnset", "突然", "patient", "positive", "certain", "new_onset"),
      A("symptoms.rapidPeak", "眨眼就疼到极点", "patient", "positive", "certain", "new_onset"),
    ],
    expectedMappings: [
      M("symptoms.suddenOnset", true, "known", "new_onset"),
      M("symptoms.rapidPeak", true, "known", "new_onset"),
    ],
  }),
  H("P2A3-COL-02", "colloquial", "HEADACHE_V1", "头疼的时候左手像断了电，杯子都端不住。", [
    K("chiefComplaint.code", "headache"),
    K("redFlags.neurologicalDeficit", true, "new_onset"),
  ], {
    attributeExpectations: [
      A("redFlags.neurologicalDeficit", "左手像断了电", "patient", "positive", "certain", "new_onset"),
    ],
    expectedMappings: [M("redFlags.neurologicalDeficit", true, "known", "new_onset")],
  }),
  H("P2A3-COL-03", "colloquial", "CHEST_PAIN_V1", "胸口疼，每吸一口都觉得气不够用。", [
    K("chiefComplaint.code", "chest_pain"),
    K("redFlags.difficultyBreathing", true, "current"),
  ], {
    attributeExpectations: [
      A("redFlags.difficultyBreathing", "气不够用"),
    ],
    expectedMappings: [M("redFlags.difficultyBreathing", true, "known", "current")],
  }),
  H("P2A3-COL-04", "colloquial", "CHEST_PAIN_V1", "心口疼，像被一扇门板顶住，沉得喘不过来。", [
    K("chiefComplaint.code", "chest_pain"),
    K("redFlags.pressureOrCrushing", true, "current"),
    K("redFlags.difficultyBreathing", true, "current"),
  ], {
    attributeExpectations: [
      A("redFlags.pressureOrCrushing", "像被一扇门板顶住"),
      A("redFlags.difficultyBreathing", "喘不过来"),
    ],
    expectedMappings: [
      M("redFlags.pressureOrCrushing", true, "known", "current"),
      M("redFlags.difficultyBreathing", true, "known", "current"),
    ],
  }),

  H("P2A3-TYP-01", "typo", "HEADACHE_V1", "头疼，左边胳博发麻，说花也含胡。", [
    K("chiefComplaint.code", "headache"),
    K("redFlags.neurologicalDeficit", true, "current"),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "左边胳博发麻")],
    expectedMappings: [M("redFlags.neurologicalDeficit", true, "known", "current")],
  }),
  H("P2A3-TYP-02", "typo", "HEADACHE_V1", "头痛还发稍，勃子僵硬得低不下去。", [
    K("chiefComplaint.code", "headache"),
    K("redFlags.feverNeckStiffness", true, "current"),
  ], {
    attributeExpectations: [
      A("redFlags.feverNeckStiffness", "发稍"),
      A("redFlags.feverNeckStiffness", "勃子僵硬得低不下去"),
    ],
    expectedMappings: [M("redFlags.feverNeckStiffness", true, "known", "current")],
  }),
  H("P2A3-TYP-03", "typo", "CHEST_PAIN_V1", "胸疼，同时呼息困男，像吸不进汽。", [
    K("chiefComplaint.code", "chest_pain"),
    K("redFlags.difficultyBreathing", true, "current"),
  ], {
    attributeExpectations: [A("redFlags.difficultyBreathing", "呼息困男")],
    expectedMappings: [M("redFlags.difficultyBreathing", true, "known", "current")],
  }),
  H("P2A3-TYP-04", "typo", "CHEST_PAIN_V1", "胸口痛疼申到左臂和下吧。", [
    K("chiefComplaint.code", "chest_pain"),
    K("redFlags.painRadiation", true, "current"),
  ], {
    attributeExpectations: [A("redFlags.painRadiation", "疼申到左臂和下吧")],
    expectedMappings: [M("redFlags.painRadiation", true, "known", "current")],
  }),

  H("P2A3-NEG-01", "negation", "HEADACHE_V1", "这次头痛没有半边无力，也没有嘴歪。", [
    K("chiefComplaint.code", "headache"),
    K("redFlags.neurologicalDeficit", false, "current"),
  ], {
    attributeExpectations: [A("redFlags.neurologicalDeficit", "半边无力", "patient", "negative")],
    expectedMappings: [M("redFlags.neurologicalDeficit", false, "known", "current")],
  }),
  H("P2A3-NEG-02", "negation", "HEADACHE_V1", "头疼是逐步出现的，并不是突然发作。", [
    K("chiefComplaint.code", "headache"),
    K("symptoms.onsetPattern", "gradual", "current"),
    K("symptoms.suddenOnset", false, "current"),
  ], {
    attributeExpectations: [A("symptoms.suddenOnset", "突然", "patient", "negative")],
    expectedMappings: [M("symptoms.suddenOnset", false, "known", "current")],
  }),
  H("P2A3-NEG-03", "negation", "CHEST_PAIN_V1", "胸口疼，但从未喘不上气。", [
    K("chiefComplaint.code", "chest_pain"),
    K("redFlags.difficultyBreathing", false, "current"),
  ], {
    attributeExpectations: [A("redFlags.difficultyBreathing", "喘不上气", "patient", "negative")],
    expectedMappings: [M("redFlags.difficultyBreathing", false, "known", "current")],
  }),
  H("P2A3-NEG-04", "negation", "CHEST_PAIN_V1", "胸疼时没晕过，也没冒冷汗。", [
    K("chiefComplaint.code", "chest_pain"),
    K("redFlags.collapseOrSweating", false, "previous"),
  ], {
    attributeExpectations: [
      A("redFlags.collapseOrSweating", "晕过", "patient", "negative", "certain", "previous"),
      A("redFlags.collapseOrSweating", "冷汗", "patient", "negative", "certain", "previous"),
    ],
    expectedMappings: [M("redFlags.collapseOrSweating", false, "known", "previous")],
  }),

  H("P2A3-UNC-01", "uncertainty", "HEADACHE_V1", "头痛时像是左腿没劲，可我拿不准。", [
    K("chiefComplaint.code", "headache"),
    U("redFlags.neurologicalDeficit", "previous"),
  ], {
    expectedUncertainties: ["redFlags.neurologicalDeficit"],
    attributeExpectations: [
      A("redFlags.neurologicalDeficit", "左腿没劲", "patient", "positive", "uncertain", "previous"),
    ],
    expectedMappings: [M("redFlags.neurologicalDeficit", null, "uncertain", "previous")],
    expectedClarifications: ["redFlags.neurologicalDeficit"],
  }),
  H("P2A3-UNC-02", "uncertainty", "HEADACHE_V1", "也许在发烧，脖子似乎硬得转不动，我不敢确定。", [
    U("redFlags.feverNeckStiffness", "current"),
  ], {
    expectedUncertainties: ["redFlags.feverNeckStiffness"],
    attributeExpectations: [
      A("redFlags.feverNeckStiffness", "发烧", "patient", "positive", "uncertain"),
      A("redFlags.feverNeckStiffness", "脖子似乎硬", "patient", "positive", "uncertain"),
    ],
    expectedMappings: [M("redFlags.feverNeckStiffness", null, "uncertain", "current")],
    expectedClarifications: ["redFlags.feverNeckStiffness"],
  }),
  H("P2A3-UNC-03", "uncertainty", "CHEST_PAIN_V1", "胸口可能像重物压着，但我拿不准。", [
    K("chiefComplaint.code", "chest_pain"),
    U("redFlags.pressureOrCrushing", "current"),
  ], {
    expectedUncertainties: ["redFlags.pressureOrCrushing"],
    attributeExpectations: [
      A("redFlags.pressureOrCrushing", "重物压着", "patient", "positive", "uncertain"),
    ],
    expectedMappings: [M("redFlags.pressureOrCrushing", null, "uncertain", "current")],
    expectedClarifications: ["redFlags.pressureOrCrushing"],
  }),
  H("P2A3-UNC-04", "uncertainty", "CHEST_PAIN_V1", "胸痛时似乎晕过一下，可我实在拿不准。", [
    K("chiefComplaint.code", "chest_pain"),
    U("redFlags.collapseOrSweating", "previous"),
  ], {
    expectedUncertainties: ["redFlags.collapseOrSweating"],
    attributeExpectations: [
      A("redFlags.collapseOrSweating", "晕过", "patient", "positive", "uncertain", "previous"),
    ],
    expectedMappings: [M("redFlags.collapseOrSweating", null, "uncertain", "previous")],
    expectedClarifications: ["redFlags.collapseOrSweating"],
  }),

  H("P2A3-TIM-01", "temporality", "HEADACHE_V1", "三天前头痛时左手麻木，今天手脚正常。", [
    K("chiefComplaint.code", "headache", "previous"),
    K("redFlags.neurologicalDeficit", true, "previous"),
  ], {
    attributeExpectations: [
      A("redFlags.neurologicalDeficit", "左手麻木", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [M("redFlags.neurologicalDeficit", true, "known", "previous")],
  }),
  H("P2A3-TIM-02", "temporality", "HEADACHE_V1", "我现在头痛，家人说此刻怎么喊都叫不醒我。", [
    K("chiefComplaint.code", "headache", "current"),
    K("redFlags.alteredConsciousness", true, "current"),
  ], {
    attributeExpectations: [
      A("redFlags.alteredConsciousness", "叫不醒", "patient", "positive", "certain", "current"),
    ],
    expectedMappings: [M("redFlags.alteredConsciousness", true, "known", "current")],
  }),
  H("P2A3-TIM-03", "temporality", "CHEST_PAIN_V1", "前天胸口疼并放射到右臂，今天没再出现。", [
    K("chiefComplaint.code", "chest_pain", "previous"),
    K("redFlags.painRadiation", true, "previous"),
  ], {
    attributeExpectations: [
      A("redFlags.painRadiation", "放射到右臂", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [M("redFlags.painRadiation", true, "known", "previous")],
  }),
  H("P2A3-TIM-04", "temporality", "CHEST_PAIN_V1", "上午胸痛时喘不上气，现在呼吸已经恢复。", [
    K("chiefComplaint.code", "chest_pain", "previous"),
    K("redFlags.difficultyBreathing", true, "previous"),
  ], {
    attributeExpectations: [
      A("redFlags.difficultyBreathing", "喘不上气", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [M("redFlags.difficultyBreathing", true, "known", "previous")],
  }),

  H("P2A3-QUO-01", "quoted", "HEADACHE_V1", "科普文章写着“突然头痛要警惕”，这不是在说我的症状。", [], {
    attributeExpectations: [
      A("symptoms.suddenOnset", "突然", "unclear", "positive", "certain", "new_onset", true),
    ],
    expectedMappings: [M("symptoms.suddenOnset", true, "known", "new_onset")],
  }),
  H("P2A3-QUO-02", "quoted", "HEADACHE_V1", "我同事头疼后右腿没劲，我只是在替他咨询。", [], {
    attributeExpectations: [
      A("redFlags.neurologicalDeficit", "右腿没劲", "other", "positive", "certain", "new_onset"),
    ],
    expectedMappings: [M("redFlags.neurologicalDeficit", true, "known", "new_onset")],
  }),
  H("P2A3-QUO-03", "quoted", "CHEST_PAIN_V1", "医生问我“胸痛时会不会喘不上气”，我回答没有。", [
    K("redFlags.difficultyBreathing", false, "previous"),
  ], {
    attributeExpectations: [
      A("redFlags.difficultyBreathing", "喘不上气", "patient", "negative", "certain", "previous"),
    ],
    expectedMappings: [M("redFlags.difficultyBreathing", false, "known", "previous")],
  }),
  H("P2A3-QUO-04", "quoted", "CHEST_PAIN_V1", "我爱人说她胸口像石头压着而且喘不过气，不是我的情况。", [], {
    attributeExpectations: [
      A("redFlags.pressureOrCrushing", "石头压", "other"),
      A("redFlags.difficultyBreathing", "喘不过气", "other"),
    ],
    expectedMappings: [
      M("redFlags.pressureOrCrushing", true, "known", "current"),
      M("redFlags.difficultyBreathing", true, "known", "current"),
    ],
  }),

  H("P2A3-HYP-01", "hypothetical", "HEADACHE_V1", "倘若以后突然头痛，我需要马上记录时间吗？", [], {
    attributeExpectations: [
      A("symptoms.suddenOnset", "突然", "patient", "positive", "certain", "new_onset", false, true),
    ],
    expectedMappings: [M("symptoms.suddenOnset", true, "known", "new_onset")],
  }),
  H("P2A3-HYP-02", "hypothetical", "HEADACHE_V1", "假设一个人头痛后左边手脚无力，这算危险信号吗？", [], {
    attributeExpectations: [
      A("redFlags.neurologicalDeficit", "左边手脚无力", "other", "positive", "certain", "new_onset", false, true),
    ],
    expectedMappings: [M("redFlags.neurologicalDeficit", true, "known", "new_onset")],
  }),
  H("P2A3-HYP-03", "hypothetical", "CHEST_PAIN_V1", "万一将来胸痛并放射到下颌，应该去哪里？", [], {
    attributeExpectations: [
      A("redFlags.painRadiation", "放射到下颌", "patient", "positive", "certain", "current", false, true),
    ],
    expectedMappings: [M("redFlags.painRadiation", true, "known", "current")],
  }),
  H("P2A3-HYP-04", "hypothetical", "CHEST_PAIN_V1", "要是有人胸痛后晕倒冒冷汗，该怎么求助？", [], {
    attributeExpectations: [
      A("redFlags.collapseOrSweating", "晕倒", "other", "positive", "certain", "previous", false, true),
      A("redFlags.collapseOrSweating", "冷汗", "other", "positive", "certain", "previous", false, true),
    ],
    expectedMappings: [M("redFlags.collapseOrSweating", true, "known", "previous")],
  }),

  H("P2A3-COR-01", "correction", "HEADACHE_V1", "补充纠正：实际是猛地开始的，不是慢慢加重。", [
    K("symptoms.onsetPattern", "sudden_severe", "new_onset", true),
    K("symptoms.suddenOnset", true, "new_onset", true),
  ], {
    contextFacts: [K("symptoms.onsetPattern", "gradual", "previous")],
    attributeExpectations: [
      A("symptoms.suddenOnset", "猛地", "patient", "positive", "certain", "new_onset"),
    ],
    expectedMappings: [
      M("symptoms.onsetPattern", "sudden_severe", "known", "new_onset"),
      M("symptoms.suddenOnset", true, "known", "new_onset"),
    ],
  }),
  H("P2A3-COR-02", "correction", "HEADACHE_V1", "前面答反了，我现在确实嘴歪。", [
    K("redFlags.neurologicalDeficit", true, "current", true),
  ], {
    contextFacts: [K("redFlags.neurologicalDeficit", false, "previous")],
    attributeExpectations: [
      A("redFlags.neurologicalDeficit", "嘴歪", "patient", "positive", "certain", "current"),
    ],
    expectedMappings: [M("redFlags.neurologicalDeficit", true, "known", "current")],
  }),
  H("P2A3-COR-03", "correction", "CHEST_PAIN_V1", "改正一下，刚才确实吸不到空气。", [
    K("redFlags.difficultyBreathing", true, "previous", true),
  ], {
    contextFacts: [K("redFlags.difficultyBreathing", false, "previous")],
    attributeExpectations: [
      A("redFlags.difficultyBreathing", "吸不到空气", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [M("redFlags.difficultyBreathing", true, "known", "previous")],
  }),
  H("P2A3-COR-04", "correction", "CHEST_PAIN_V1", "我撤回刚才的回答，当时的确晕倒并出了冷汗。", [
    K("redFlags.collapseOrSweating", true, "previous", true),
  ], {
    contextFacts: [K("redFlags.collapseOrSweating", false, "previous")],
    attributeExpectations: [
      A("redFlags.collapseOrSweating", "晕倒", "patient", "positive", "certain", "previous"),
      A("redFlags.collapseOrSweating", "冷汗", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [M("redFlags.collapseOrSweating", true, "known", "previous")],
  }),

  H("P2A3-CON-01", "conflict", "HEADACHE_V1", "我先说不是突然开始，可仔细回忆又像是一瞬间发作。", [
    U("symptoms.onsetPattern", "new_onset"),
  ], {
    expectedConflicts: ["symptoms.onsetPattern"],
    attributeExpectations: [
      A("symptoms.onsetPattern", "突然", "patient", "negative", "certain", "new_onset"),
      A("symptoms.onsetPattern", "一瞬间", "patient", "positive", "uncertain", "new_onset"),
    ],
    expectedMappings: [M("symptoms.onsetPattern", null, "uncertain", "new_onset")],
    expectedClarifications: ["symptoms.onsetPattern"],
  }),
  H("P2A3-CON-02", "conflict", "HEADACHE_V1", "没有右手无力；等会儿，我右手现在确实抬不动。", [
    C("redFlags.neurologicalDeficit", [false, true], "current"),
  ], {
    expectedConflicts: ["redFlags.neurologicalDeficit"],
    attributeExpectations: [
      A("redFlags.neurologicalDeficit", "右手无力", "patient", "negative"),
      A("redFlags.neurologicalDeficit", "右手现在确实抬不动", "patient", "positive"),
    ],
    expectedMappings: [M("redFlags.neurologicalDeficit", [false, true], "conflicting", "current")],
    expectedClarifications: ["redFlags.neurologicalDeficit"],
  }),
  H("P2A3-CON-03", "conflict", "CHEST_PAIN_V1", "我没觉得胸口被压着，但现在又确实像石头压住。", [
    C("redFlags.pressureOrCrushing", [false, true], "current"),
  ], {
    expectedConflicts: ["redFlags.pressureOrCrushing"],
    attributeExpectations: [
      A("redFlags.pressureOrCrushing", "胸口被压着", "patient", "negative"),
      A("redFlags.pressureOrCrushing", "石头压", "patient", "positive"),
    ],
    expectedMappings: [M("redFlags.pressureOrCrushing", [false, true], "conflicting", "current")],
    expectedClarifications: ["redFlags.pressureOrCrushing"],
  }),
  H("P2A3-CON-04", "conflict", "CHEST_PAIN_V1", "刚说没晕过，可家人提醒我刚才确实倒下了。", [
    C("redFlags.collapseOrSweating", [false, true], "previous"),
  ], {
    expectedConflicts: ["redFlags.collapseOrSweating"],
    attributeExpectations: [
      A("redFlags.collapseOrSweating", "晕过", "patient", "negative", "certain", "previous"),
      A("redFlags.collapseOrSweating", "倒下", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [M("redFlags.collapseOrSweating", [false, true], "conflicting", "previous")],
    expectedClarifications: ["redFlags.collapseOrSweating"],
  }),

  H("P2A3-MIX-01", "mixed_implicit", "HEADACHE_V1", "脑袋疼得像被劈开，转眼就是最痛，左脚还拖不动。", [
    K("chiefComplaint.code", "headache"),
    K("symptoms.rapidPeak", true, "new_onset"),
    K("redFlags.neurologicalDeficit", true, "current"),
  ], {
    attributeExpectations: [
      A("symptoms.rapidPeak", "转眼就是最痛", "patient", "positive", "certain", "new_onset"),
      A("redFlags.neurologicalDeficit", "左脚还拖不动"),
    ],
    expectedMappings: [
      M("symptoms.rapidPeak", true, "known", "new_onset"),
      M("redFlags.neurologicalDeficit", true, "known", "current"),
    ],
  }),
  H("P2A3-MIX-02", "mixed_implicit", "HEADACHE_V1", "头痛伴着浑身发烫，脖颈像焊住一样动不了。", [
    K("chiefComplaint.code", "headache"),
    K("redFlags.feverNeckStiffness", true, "current"),
  ], {
    attributeExpectations: [
      A("redFlags.feverNeckStiffness", "浑身发烫"),
      A("redFlags.feverNeckStiffness", "脖颈像焊住一样动不了"),
    ],
    expectedMappings: [M("redFlags.feverNeckStiffness", true, "known", "current")],
  }),
  H("P2A3-MIX-03", "mixed_implicit", "CHEST_PAIN_V1", "胸口像被皮带勒死，吸气只能吸到一半。", [
    K("redFlags.pressureOrCrushing", true, "current"),
    K("redFlags.difficultyBreathing", true, "current"),
  ], {
    attributeExpectations: [
      A("redFlags.pressureOrCrushing", "像被皮带勒死"),
      A("redFlags.difficultyBreathing", "吸气只能吸到一半"),
    ],
    expectedMappings: [
      M("redFlags.pressureOrCrushing", true, "known", "current"),
      M("redFlags.difficultyBreathing", true, "known", "current"),
    ],
  }),
  H("P2A3-MIX-04", "mixed_implicit", "CHEST_PAIN_V1", "胸疼顺着肩胛骨跑到右手，随后整个人软倒，额头全是汗。", [
    K("chiefComplaint.code", "chest_pain"),
    K("redFlags.painRadiation", true, "previous"),
    K("redFlags.collapseOrSweating", true, "previous"),
  ], {
    attributeExpectations: [
      A("redFlags.painRadiation", "顺着肩胛骨跑到右手", "patient", "positive", "certain", "previous"),
      A("redFlags.collapseOrSweating", "整个人软倒", "patient", "positive", "certain", "previous"),
      A("redFlags.collapseOrSweating", "额头全是汗", "patient", "positive", "certain", "previous"),
    ],
    expectedMappings: [
      M("redFlags.painRadiation", true, "known", "previous"),
      M("redFlags.collapseOrSweating", true, "known", "previous"),
    ],
  }),
]);
