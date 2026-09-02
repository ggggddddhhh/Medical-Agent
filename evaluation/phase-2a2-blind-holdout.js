// SEALED HOLDOUT: production semantic rules were frozen at b25c8b1 before this
// dataset was authored. Once a real-model result exists, these cases must never
// be reused as a blind holdout after rule tuning.
import { SEMANTIC_SCHEMA_VERSION } from "../src/semantic/extraction-schema.js";

const K = (path, value, temporality = "unspecified", contradictionCandidate = false) => ({
  path, value, status: "known", confidence: 0.95, temporality, contradictionCandidate,
});
const U = (path) => ({ path, value: null, status: "uncertain", confidence: 0.5, temporality: "unspecified", contradictionCandidate: false });
const C = (path, values) => ({ path, value: values, status: "conflicting", confidence: 0.5, temporality: "unspecified", contradictionCandidate: true });
const B = (id, category, pathway, input, expectedFacts = [], options = {}) => ({
  id, category, pathway, input, expectedFacts,
  contextFacts: options.contextFacts ?? [],
  expectedUncertainties: options.expectedUncertainties ?? [],
  expectedConflicts: options.expectedConflicts ?? [],
  schemaVersion: SEMANTIC_SCHEMA_VERSION,
  exhaustive: true,
  holdout: true,
});

export const phase2a2BlindHoldoutCases = Object.freeze([
  B("BLIND-COL-01", "colloquial", "HEADACHE_V1", "后脑勺猛地轰了一下，不到一分钟疼到扛不住。", [K("chiefComplaint.code", "headache"), K("symptoms.onsetPattern", "sudden_severe", "new_onset"), K("symptoms.suddenOnset", true, "new_onset"), K("symptoms.rapidPeak", true, "new_onset")]),
  B("BLIND-COL-02", "colloquial", "HEADACHE_V1", "头疼以后左手像断了电，话到嘴边说不利索。", [K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true, "new_onset")]),
  B("BLIND-COL-03", "colloquial", "CHEST_PAIN_V1", "胸前跟被皮带勒死似的，越勒越紧。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true, "current")]),
  B("BLIND-COL-04", "colloquial", "CHEST_PAIN_V1", "胸疼那会儿人一软就瘫了，后背全是汗。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.collapseOrSweating", true, "previous")]),

  B("BLIND-TYP-01", "typo", "HEADACHE_V1", "头痛后右腿发麻，说话不青楚。", [K("chiefComplaint.code", "headache"), K("redFlags.neurologicalDeficit", true, "current")]),
  B("BLIND-TYP-02", "typo", "HEADACHE_V1", "头疼时意识模胡，家人差点叫不醒。", [K("chiefComplaint.code", "headache"), K("redFlags.alteredConsciousness", true, "previous")]),
  B("BLIND-TYP-03", "typo", "CHEST_PAIN_V1", "胸口象被重务压住，疼得没停。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true, "current"), K("symptoms.persistentSevere", true, "current")]),
  B("BLIND-TYP-04", "typo", "CHEST_PAIN_V1", "胸痛放社到左手和下额。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.painRadiation", true, "current")]),

  B("BLIND-NEG-01", "negation", "HEADACHE_V1", "头疼归头疼，从来没昏过去，也没有叫不醒。", [K("chiefComplaint.code", "headache"), K("redFlags.alteredConsciousness", false, "current")]),
  B("BLIND-NEG-02", "negation", "HEADACHE_V1", "我头痛，可没有撞过头，近期也没摔到。", [K("chiefComplaint.code", "headache"), K("redFlags.recentHeadTrauma", false, "current")]),
  B("BLIND-NEG-03", "negation", "CHEST_PAIN_V1", "胸口痛，但一点压榨或重物压着的感觉都没有。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", false, "current")]),
  B("BLIND-NEG-04", "negation", "CHEST_PAIN_V1", "胸疼没有扩散，肩背、胳膊和下颌都不痛。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.painRadiation", false, "current")]),

  B("BLIND-UNC-01", "uncertainty", "HEADACHE_V1", "头疼时嘴角似乎偏了一点，也许只是光线问题。", [K("chiefComplaint.code", "headache"), U("redFlags.neurologicalDeficit")], { expectedUncertainties: ["redFlags.neurologicalDeficit"] }),
  B("BLIND-UNC-02", "uncertainty", "HEADACHE_V1", "脖子可能有点僵，我不敢肯定自己是不是发烧。", [U("redFlags.feverNeckStiffness")], { expectedUncertainties: ["redFlags.feverNeckStiffness"] }),
  B("BLIND-UNC-03", "uncertainty", "CHEST_PAIN_V1", "胸口像是被压着，又可能只是衣服太紧。", [K("chiefComplaint.code", "chest_pain"), U("redFlags.pressureOrCrushing")], { expectedUncertainties: ["redFlags.pressureOrCrushing"] }),
  B("BLIND-UNC-04", "uncertainty", "CHEST_PAIN_V1", "刚才眼前黑没黑我说不准，好像出了点汗。", [U("redFlags.collapseOrSweating")], { expectedUncertainties: ["redFlags.collapseOrSweating"] }),

  B("BLIND-TIM-01", "temporality", "HEADACHE_V1", "三天前头痛时左臂抬不起来，现在活动正常。", [K("chiefComplaint.code", "headache", "previous"), K("redFlags.neurologicalDeficit", true, "previous")]),
  B("BLIND-TIM-02", "temporality", "HEADACHE_V1", "前天突然剧烈头痛过，今天只剩轻微不适。", [K("chiefComplaint.code", "headache", "previous"), K("symptoms.onsetPattern", "sudden_severe", "previous"), K("symptoms.suddenOnset", true, "previous")]),
  B("BLIND-TIM-03", "temporality", "CHEST_PAIN_V1", "昨夜胸痛时冷汗湿了衣服，眼下已经没有冷汗。", [K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.collapseOrSweating", true, "previous")]),
  B("BLIND-TIM-04", "temporality", "CHEST_PAIN_V1", "上午胸痛放到下巴，现在疼痛已经消失。", [K("chiefComplaint.code", "chest_pain", "previous"), K("redFlags.painRadiation", true, "previous"), K("symptoms.activeNow", false, "resolved")]),

  B("BLIND-QUO-01", "quoted", "HEADACHE_V1", "群里有人说自己头痛几秒到顶，我只是转述。", []),
  B("BLIND-QUO-02", "quoted", "HEADACHE_V1", "家属说她发烧脖子硬，症状不是我的。", []),
  B("BLIND-QUO-03", "quoted", "CHEST_PAIN_V1", "新闻里的患者胸口被压住还喘不过来，与我无关。", []),
  B("BLIND-QUO-04", "quoted", "CHEST_PAIN_V1", "护士问‘有没有晕倒冷汗’，我的回答是都没有。", [K("redFlags.collapseOrSweating", false, "current")]),

  B("BLIND-HYP-01", "hypothetical", "HEADACHE_V1", "要是哪天头突然像雷劈一样疼，该怎么记录？", []),
  B("BLIND-HYP-02", "hypothetical", "HEADACHE_V1", "假设头疼后看东西重影，会问哪些问题？", []),
  B("BLIND-HYP-03", "hypothetical", "CHEST_PAIN_V1", "万一胸痛扩散到肩背，应当怎么描述？", []),
  B("BLIND-HYP-04", "hypothetical", "CHEST_PAIN_V1", "如果一个人胸疼又喘不动，需要记录什么？", []),

  B("BLIND-COR-01", "correction", "HEADACHE_V1", "纠正前面的回答，我是突然起痛，不是慢慢加重。", [K("symptoms.onsetPattern", "sudden_severe", "new_onset", true), K("symptoms.suddenOnset", true, "new_onset", true)], { contextFacts: [K("symptoms.onsetPattern", "gradual", "previous")] }),
  B("BLIND-COR-02", "correction", "HEADACHE_V1", "补充更正：家人说我刚刚短暂失去意识。", [K("redFlags.alteredConsciousness", true, "previous", true)], { contextFacts: [K("redFlags.alteredConsciousness", false, "previous")] }),
  B("BLIND-COR-03", "correction", "CHEST_PAIN_V1", "前面说没放射不准确，疼其实到了右肩背。", [K("redFlags.painRadiation", true, "previous", true)], { contextFacts: [K("redFlags.painRadiation", false, "previous")] }),
  B("BLIND-COR-04", "correction", "CHEST_PAIN_V1", "更正刚才的话，当时有冷汗而且差点倒下。", [K("redFlags.collapseOrSweating", true, "previous", true)], { contextFacts: [K("redFlags.collapseOrSweating", false, "previous")] }),

  B("BLIND-CON-01", "conflict", "HEADACHE_V1", "起初觉得是逐渐疼，回想后又像是突然爆发。", [C("symptoms.onsetPattern", ["gradual", "sudden_severe"])], { expectedConflicts: ["symptoms.onsetPattern"] }),
  B("BLIND-CON-02", "conflict", "HEADACHE_V1", "我说没失去意识，可家人坚持说我刚才叫不醒。", [C("redFlags.alteredConsciousness", [false, true])], { expectedConflicts: ["redFlags.alteredConsciousness"] }),
  B("BLIND-CON-03", "conflict", "CHEST_PAIN_V1", "刚说完全不憋气，但又想起那会儿怎么都吸不够。", [C("redFlags.difficultyBreathing", [false, true])], { expectedConflicts: ["redFlags.difficultyBreathing"] }),
  B("BLIND-CON-04", "conflict", "CHEST_PAIN_V1", "先说没有压迫感，仔细想又像胸前压了块铁板。", [C("redFlags.pressureOrCrushing", [false, true])], { expectedConflicts: ["redFlags.pressureOrCrushing"] }),

  B("BLIND-MIX-01", "mixed_implicit", "HEADACHE_V1", "头痛6分，发作时右脚拖地，舌头像打结。", [K("chiefComplaint.code", "headache"), K("symptoms.severity", 6), K("redFlags.neurologicalDeficit", true, "current")]),
  B("BLIND-MIX-02", "mixed_implicit", "HEADACHE_V1", "脑袋忽然像电击，眨眼工夫就疼到极点。", [K("chiefComplaint.code", "headache"), K("symptoms.onsetPattern", "sudden_severe", "new_onset"), K("symptoms.suddenOnset", true, "new_onset"), K("symptoms.rapidPeak", true, "new_onset")]),
  B("BLIND-MIX-03", "mixed_implicit", "CHEST_PAIN_V1", "胸痛一直顶着不退，还顺着脖子跑到下颌。", [K("chiefComplaint.code", "chest_pain"), K("symptoms.persistentSevere", true, "current"), K("redFlags.painRadiation", true, "current")]),
  B("BLIND-MIX-04", "mixed_implicit", "CHEST_PAIN_V1", "胸前像被人用膝盖压着，呼吸只能吸半口。", [K("chiefComplaint.code", "chest_pain"), K("redFlags.pressureOrCrushing", true, "current"), K("redFlags.difficultyBreathing", true, "current")]),
]);
