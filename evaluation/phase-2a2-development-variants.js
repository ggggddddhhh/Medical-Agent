import { SEMANTIC_SCHEMA_VERSION } from "../src/semantic/extraction-schema.js";

const K = (path, value, temporality = "unspecified", contradictionCandidate = false) => ({
  path, value, status: "known", confidence: 0.95, temporality, contradictionCandidate,
});
const U = (path) => ({
  path, value: null, status: "uncertain", confidence: 0.5,
  temporality: "unspecified", contradictionCandidate: false,
});
const C = (path, values) => ({
  path, value: values, status: "conflicting", confidence: 0.5,
  temporality: "unspecified", contradictionCandidate: true,
});
const V = (id, category, pathway, input, expectedFacts = [], options = {}) => ({
  id, category, pathway, input, expectedFacts, contextFacts: options.contextFacts ?? [],
  expectedUncertainties: options.expectedUncertainties ?? [],
  expectedConflicts: options.expectedConflicts ?? [],
  schemaVersion: SEMANTIC_SCHEMA_VERSION,
  exhaustive: true,
});

export const phase2a2DevelopmentVariants = Object.freeze([
  // Colloquial language
  V("DEV-COL-01", "colloquial", "HEADACHE_V1", "脑壳猛地像炸开，十来秒就痛到顶。", [K("chiefComplaint.code", "headache"), K("symptoms.onsetPattern", "sudden_severe", "new_onset"), K("symptoms.suddenOnset", true, "new_onset"), K("symptoms.rapidPeak", true, "new_onset")]),
  V("DEV-COL-02", "colloquial", "HEADACHE_V1", "头疼得很，但它是慢慢加上来的。", [K("chiefComplaint.code", "headache"), K("symptoms.onsetPattern", "gradual")]),
  V("DEV-COL-03", "colloquial", "HEADACHE_V1", "头疼后半边手使不上劲，讲话也含糊。", [K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true, "new_onset")]),
  V("DEV-COL-04", "colloquial", "CHEST_PAIN_V1", "心口像压了个秤砣，沉得慌。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true, "current")]),
  V("DEV-COL-05", "colloquial", "CHEST_PAIN_V1", "胸口疼，气儿怎么都接不上。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", true, "current")]),
  V("DEV-COL-06", "colloquial", "CHEST_PAIN_V1", "胸疼时眼前一黑差点栽倒，汗哗哗往下流。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.collapseOrSweating", true, "previous")]),

  // Misspellings and character variants
  V("DEV-TYP-01", "typo", "HEADACHE_V1", "头痛，嘴有点歪，还说化不清。", [K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true, "current")]),
  V("DEV-TYP-02", "typo", "HEADACHE_V1", "头疼还发高稍，脖梗子硬得低不下去。", [K("chiefComplaint.code", "headache"), K("redFlags.feverNeckStiffness", true, "current")]),
  V("DEV-TYP-03", "typo", "HEADACHE_V1", "突然头疼，十几妙就到了最历害。", [K("chiefComplaint.code", "headache"), K("symptoms.onsetPattern", "sudden_severe", "new_onset"), K("symptoms.suddenOnset", true, "new_onset"), K("symptoms.rapidPeak", true, "new_onset")]),
  V("DEV-TYP-04", "typo", "CHEST_PAIN_V1", "胸疼，还喘不过汽。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", true, "current")]),
  V("DEV-TYP-05", "typo", "CHEST_PAIN_V1", "胸囗有压榨感，一直很疼。", [K("redFlags.pressureOrCrushing", true, "current"), K("symptoms.persistentSevere", true, "current")]),
  V("DEV-TYP-06", "typo", "CHEST_PAIN_V1", "胸痛窜到左胳博和下吧。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.painRadiation", true, "current")]),

  // Explicit negation
  V("DEV-NEG-01", "negation", "HEADACHE_V1", "我头痛，但没有嘴歪，也没出现一边手脚没劲。", [K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", false, "current")]),
  V("DEV-NEG-02", "negation", "HEADACHE_V1", "头疼是慢慢来的，不是突然一下发作。", [K("chiefComplaint.code", "headache"), K("symptoms.onsetPattern", "gradual"), K("symptoms.suddenOnset", false)]),
  V("DEV-NEG-03", "negation", "HEADACHE_V1", "我头痛，没有发烧，脖子也不硬。", [K("chiefComplaint.code", "headache"), K("redFlags.feverNeckStiffness", false, "current")]),
  V("DEV-NEG-04", "negation", "CHEST_PAIN_V1", "胸痛，但完全没有喘不上气。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.difficultyBreathing", false, "current")]),
  V("DEV-NEG-05", "negation", "CHEST_PAIN_V1", "胸疼时没晕倒，也没有出冷汗。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.collapseOrSweating", false, "current")]),
  V("DEV-NEG-06", "negation", "CHEST_PAIN_V1", "胸口疼，不过没往手臂、背或下巴窜。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.painRadiation", false, "current")]),

  // User uncertainty
  V("DEV-UNC-01", "uncertainty", "HEADACHE_V1", "头痛时好像半边手有点没劲，我不太确定。", [K("chiefComplaint.code", "headache"), U("redFlags.neurologicalDeficit")], { expectedUncertainties: ["redFlags.neurologicalDeficit"] }),
  V("DEV-UNC-02", "uncertainty", "HEADACHE_V1", "我说不准头疼是不是突然一下开始的。", [K("chiefComplaint.code", "headache"), U("symptoms.onsetPattern")], { expectedUncertainties: ["symptoms.onsetPattern"] }),
  V("DEV-UNC-03", "uncertainty", "HEADACHE_V1", "似乎发热而且脖子有些硬，也可能是我感觉错了。", [U("redFlags.feverNeckStiffness")], { expectedUncertainties: ["redFlags.feverNeckStiffness"] }),
  V("DEV-UNC-04", "uncertainty", "CHEST_PAIN_V1", "胸痛时可能有一点喘不上来，也许只是紧张。", [K("chiefComplaint.code", "chest_pain"), U("redFlags.difficultyBreathing")], { expectedUncertainties: ["redFlags.difficultyBreathing"] }),
  V("DEV-UNC-05", "uncertainty", "CHEST_PAIN_V1", "胸口好像有压着的感觉，但我拿不准。", [K("chiefComplaint.code", "chest_pain"), U("redFlags.pressureOrCrushing")], { expectedUncertainties: ["redFlags.pressureOrCrushing"] }),
  V("DEV-UNC-06", "uncertainty", "CHEST_PAIN_V1", "刚才是不是晕了一下我记不清，也不确定有没有冷汗。", [U("redFlags.collapseOrSweating")], { expectedUncertainties: ["redFlags.collapseOrSweating"] }),

  // Historical versus current
  V("DEV-TIM-01", "temporality", "HEADACHE_V1", "昨天头痛时昏过去了，现在已经完全清醒。", [K("chiefComplaint.code", "headache", "previous"), K("redFlags.alteredConsciousness", true, "previous")]),
  V("DEV-TIM-02", "temporality", "HEADACHE_V1", "上周头痛时右手没劲，今天没有这种情况。", [K("chiefComplaint.code", "headache", "previous"), K("redFlags.neurologicalDeficit", true, "previous")]),
  V("DEV-TIM-03", "temporality", "HEADACHE_V1", "昨晚头疼突然达到最重，现在不疼了。", [K("chiefComplaint.code", "headache", "previous"), K("symptoms.onsetPattern", "sudden_severe", "previous"), K("symptoms.suddenOnset", true, "previous"), K("symptoms.activeNow", false, "resolved")]),
  V("DEV-TIM-04", "temporality", "CHEST_PAIN_V1", "昨天胸痛时喘不上气，今天呼吸正常。", [K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.difficultyBreathing", true, "previous")]),
  V("DEV-TIM-05", "temporality", "CHEST_PAIN_V1", "上星期胸疼时晕倒过，现在没有再晕。", [K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.collapseOrSweating", true, "previous")]),
  V("DEV-TIM-06", "temporality", "CHEST_PAIN_V1", "早些时候胸痛窜到左臂，现在已经缓解。", [K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.painRadiation", true, "previous"), K("symptoms.activeNow", false, "resolved")]),

  // Quoted or other-person symptoms
  V("DEV-QUO-01", "quoted", "HEADACHE_V1", "网上文章写着‘突然爆炸样头痛’，我自己没有这种头痛。", []),
  V("DEV-QUO-02", "quoted", "HEADACHE_V1", "我朋友头痛后半边手没劲，不是在说我。", []),
  V("DEV-QUO-03", "quoted", "HEADACHE_V1", "医生问我有没有发热和脖子硬，我回答都没有。", [K("redFlags.feverNeckStiffness", false, "current")]),
  V("DEV-QUO-04", "quoted", "CHEST_PAIN_V1", "资料里说‘胸口像石头压住’，但我的胸口没有这种感觉。", [K("redFlags.pressureOrCrushing", false, "current")]),
  V("DEV-QUO-05", "quoted", "CHEST_PAIN_V1", "我爱人胸痛还喘不上气，这不是我的症状。", []),
  V("DEV-QUO-06", "quoted", "CHEST_PAIN_V1", "文章举例说胸痛伴晕厥和冷汗，我没有晕也没出汗。", [K("redFlags.collapseOrSweating", false, "current")]),

  // Hypothetical language
  V("DEV-HYP-01", "hypothetical", "HEADACHE_V1", "如果以后突然头痛几秒就到顶，我应该怎么描述？", []),
  V("DEV-HYP-02", "hypothetical", "HEADACHE_V1", "假如头痛时嘴歪了是不是很危险？", []),
  V("DEV-HYP-03", "hypothetical", "HEADACHE_V1", "万一发烧又脖子硬，需要记录什么？", []),
  V("DEV-HYP-04", "hypothetical", "CHEST_PAIN_V1", "要是胸口像大石头压着该怎么办？", []),
  V("DEV-HYP-05", "hypothetical", "CHEST_PAIN_V1", "如果胸痛时喘不上气算什么情况？", []),
  V("DEV-HYP-06", "hypothetical", "CHEST_PAIN_V1", "假设有人胸痛后晕倒出冷汗呢？", []),

  // Multi-turn corrections
  V("DEV-COR-01", "correction", "HEADACHE_V1", "更正一下，头痛其实是突然一下开始的。", [K("symptoms.onsetPattern", "sudden_severe", "new_onset", true), K("symptoms.suddenOnset", true, "new_onset", true)], { contextFacts: [K("symptoms.onsetPattern", "gradual", "previous")] }),
  V("DEV-COR-02", "correction", "HEADACHE_V1", "我刚才说错了，确实有右手无力。", [K("redFlags.neurologicalDeficit", true, "current", true)], { contextFacts: [K("redFlags.neurologicalDeficit", false, "previous")] }),
  V("DEV-COR-03", "correction", "HEADACHE_V1", "重新想了想，刚才确实昏过去一次。", [K("redFlags.alteredConsciousness", true, "previous", true)], { contextFacts: [K("redFlags.alteredConsciousness", false, "previous")] }),
  V("DEV-COR-04", "correction", "CHEST_PAIN_V1", "更正，胸痛时其实有喘不过气。", [K("redFlags.difficultyBreathing", true, "previous", true)], { contextFacts: [K("redFlags.difficultyBreathing", false, "previous")] }),
  V("DEV-COR-05", "correction", "CHEST_PAIN_V1", "我改口，疼痛确实窜到了左肩。", [K("redFlags.painRadiation", true, "previous", true)], { contextFacts: [K("redFlags.painRadiation", false, "previous")] }),
  V("DEV-COR-06", "correction", "CHEST_PAIN_V1", "刚才记错了，我当时真的晕了一下。", [K("redFlags.collapseOrSweating", true, "previous", true)], { contextFacts: [K("redFlags.collapseOrSweating", false, "previous")] }),

  // Contradictory statements
  V("DEV-CON-01", "conflict", "HEADACHE_V1", "头疼不是突然来的——等等，我又觉得是一瞬间开始的。", [C("symptoms.onsetPattern", ["gradual", "sudden_severe"])], { expectedConflicts: ["symptoms.onsetPattern"] }),
  V("DEV-CON-02", "conflict", "HEADACHE_V1", "我没有嘴歪，但照镜子又觉得嘴角确实歪了。", [C("redFlags.neurologicalDeficit", [false, true])], { expectedConflicts: ["redFlags.neurologicalDeficit"] }),
  V("DEV-CON-03", "conflict", "HEADACHE_V1", "我没昏倒，等一下，家人说刚才怎么叫都叫不醒我。", [C("redFlags.alteredConsciousness", [false, true])], { expectedConflicts: ["redFlags.alteredConsciousness"] }),
  V("DEV-CON-04", "conflict", "CHEST_PAIN_V1", "我没有喘不过气，可刚才又确实吸不到空气。", [C("redFlags.difficultyBreathing", [false, true])], { expectedConflicts: ["redFlags.difficultyBreathing"] }),
  V("DEV-CON-05", "conflict", "CHEST_PAIN_V1", "胸口不是压着的，但又很像有重物压住。", [C("redFlags.pressureOrCrushing", [false, true])], { expectedConflicts: ["redFlags.pressureOrCrushing"] }),
  V("DEV-CON-06", "conflict", "CHEST_PAIN_V1", "我说没晕过，可回想起来刚才确实倒下了一次。", [C("redFlags.collapseOrSweating", [false, true])], { expectedConflicts: ["redFlags.collapseOrSweating"] }),

  // Mixed and implicit red flags
  V("DEV-MIX-01", "mixed_implicit", "HEADACHE_V1", "头痛两小时，刚才突然像开关被打开一样，半分钟就最重。", [K("chiefComplaint.code", "headache"), K("symptoms.durationMinutes", 120), K("symptoms.onsetPattern", "sudden_severe", "new_onset"), K("symptoms.suddenOnset", true, "new_onset"), K("symptoms.rapidPeak", true, "new_onset")]),
  V("DEV-MIX-02", "mixed_implicit", "HEADACHE_V1", "头疼5分，同时左腿像被抽走了力气。", [K("chiefComplaint.code", "headache"), K("symptoms.severity", 5), K("redFlags.neurologicalDeficit", true, "current")]),
  V("DEV-MIX-03", "mixed_implicit", "HEADACHE_V1", "头痛还烧得厉害，脖子像木板一样弯不下去。", [K("chiefComplaint.code", "headache"), K("redFlags.feverNeckStiffness", true, "current")]),
  V("DEV-MIX-04", "mixed_implicit", "CHEST_PAIN_V1", "胸痛7分，像有人坐在胸口上，气也吸不满。", [K("chiefComplaint.code", "chest_pain"), K("symptoms.severity", 7), K("redFlags.pressureOrCrushing", true, "current"), K("redFlags.difficultyBreathing", true, "current")]),
  V("DEV-MIX-05", "mixed_implicit", "CHEST_PAIN_V1", "胸口一直疼，疼痛顺着左肩跑到手臂。", [K("chiefComplaint.code", "chest_pain"), K("symptoms.persistentSevere", true, "current"), K("redFlags.painRadiation", true, "current")]),
  V("DEV-MIX-06", "mixed_implicit", "CHEST_PAIN_V1", "胸痛时腿一软坐到地上，衣服被汗湿透。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.collapseOrSweating", true, "previous")]),
]);
