import { SEMANTIC_SCHEMA_VERSION } from "../src/semantic/extraction-schema.js";

const U = (path, temporality = "current") => ({
  path,
  value: null,
  status: "uncertain",
  confidence: 0.5,
  temporality,
  contradictionCandidate: false,
});
const A = (path, evidenceText, temporality = "current") => ({
  path,
  evidenceText,
  subject: "unclear",
  polarity: "positive",
  certainty: "uncertain",
  temporality,
  quote: false,
  hypothetical: false,
});
const M = (path, temporality = "current") => ({
  path,
  value: null,
  status: "uncertain",
  temporality,
});
const H = (id, pathway, input, paths, attributes) => ({
  id,
  category: "subject_ambiguity",
  pathway,
  input,
  expectedFacts: paths.map((path) => U(path)),
  contextFacts: [],
  expectedUncertainties: [...paths],
  expectedConflicts: [],
  attributeExpectations: attributes,
  expectedMappings: paths.map((path) => M(path)),
  expectedClarifications: [...paths],
  schemaVersion: SEMANTIC_SCHEMA_VERSION,
  holdout: true,
  exhaustive: true,
});

export const phase2aPromotionSubjectHoldout = Object.freeze([
  H("P2A-PROMO-SUB-01", "CHEST_PAIN_V1", "说不准是我还是邻居胸口疼。", [
    "chiefComplaint.code",
  ], [A("chiefComplaint.code", "胸口疼")]),
  H("P2A-PROMO-SUB-02", "CHEST_PAIN_V1", "我朋友心口痛，而我也觉得有点难受。", [
    "chiefComplaint.code",
  ], [A("chiefComplaint.code", "心口痛")]),
  H("P2A-PROMO-SUB-03", "CHEST_PAIN_V1", "不知道是自己还是室友喘不过气。", [
    "redFlags.difficultyBreathing",
  ], [A("redFlags.difficultyBreathing", "喘不过气")]),
  H("P2A-PROMO-SUB-04", "CHEST_PAIN_V1", "我和同事中有一个胸口像被秤砣压着。", [
    "redFlags.pressureOrCrushing",
  ], [A("redFlags.pressureOrCrushing", "秤砣压着")]),
  H("P2A-PROMO-SUB-05", "CHEST_PAIN_V1", "家里人提到胸痛窜到左臂，但没说清是谁。", [
    "chiefComplaint.code",
    "redFlags.painRadiation",
  ], [
    A("chiefComplaint.code", "胸痛"),
    A("redFlags.painRadiation", "痛窜到左臂"),
  ]),
  H("P2A-PROMO-SUB-06", "CHEST_PAIN_V1", "记录里写着有人眼前一黑，但没写清是谁。", [
    "redFlags.collapseOrSweating",
  ], [A("redFlags.collapseOrSweating", "眼前一黑", "previous")]),
  H("P2A-PROMO-SUB-07", "HEADACHE_V1", "搞不清是我还是同学头痛时右手发麻。", [
    "chiefComplaint.code",
    "redFlags.neurologicalDeficit",
  ], [
    A("chiefComplaint.code", "头痛"),
    A("redFlags.neurologicalDeficit", "右手发麻"),
  ]),
  H("P2A-PROMO-SUB-08", "HEADACHE_V1", "我和室友中有一个突然头痛。", [
    "chiefComplaint.code",
    "symptoms.suddenOnset",
    "symptoms.onsetPattern",
  ], [
    A("chiefComplaint.code", "头痛", "new_onset"),
    A("symptoms.suddenOnset", "突然", "new_onset"),
    A("symptoms.onsetPattern", "突然", "new_onset"),
  ]),
  H("P2A-PROMO-SUB-09", "HEADACHE_V1", "不知道是本人还是朋友有生以来最严重的头痛。", [
    "chiefComplaint.code",
    "redFlags.worstEverHeadache",
  ], [
    A("chiefComplaint.code", "头痛"),
    A("redFlags.worstEverHeadache", "有生以来最严重的头痛"),
  ]),
  H("P2A-PROMO-SUB-10", "HEADACHE_V1", "转述里说有人头痛后叫不醒，但没讲清是谁。", [
    "chiefComplaint.code",
    "redFlags.alteredConsciousness",
  ], [
    A("chiefComplaint.code", "头痛"),
    A("redFlags.alteredConsciousness", "叫不醒", "previous"),
  ]),
  H("P2A-PROMO-SUB-11", "HEADACHE_V1", "无法确认是我还是爸爸撞到头后头痛。", [
    "chiefComplaint.code",
    "redFlags.recentHeadTrauma",
  ], [
    A("chiefComplaint.code", "头痛"),
    A("redFlags.recentHeadTrauma", "撞到头"),
  ]),
  H("P2A-PROMO-SUB-12", "HEADACHE_V1", "家属说有人发烧、脖子硬，但没说清是谁。", [
    "redFlags.feverNeckStiffness",
  ], [
    A("redFlags.feverNeckStiffness", "发烧"),
    A("redFlags.feverNeckStiffness", "脖子硬"),
  ]),
]);
