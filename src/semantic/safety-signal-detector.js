export const SAFETY_SIGNAL_DETECTOR_VERSION = "safety-signal-detector-0.1.0";

const PATHWAY_RULES = Object.freeze({
  HEADACHE_V1: Object.freeze([
    rule("sudden_onset_candidate", "symptoms.suddenOnset", true, /突然|一下子?|瞬间|猛地|骤然|炸开|爆炸一样/),
    rule("sudden_severe_onset_candidate", "symptoms.onsetPattern", "sudden_severe", /突然|一下子?|瞬间|雷击样|霹雳样|骤然|炸开|爆炸一样/),
    rule("rapid_peak_candidate", "symptoms.rapidPeak", true, /几秒(?:钟)?|十几秒|数秒|一分(?:钟)?内|一两分钟内|很快.{0,6}(?:最厉害|最严重|痛到顶|疼到顶)|立刻.{0,6}(?:最厉害|最严重|痛到顶|疼到顶)/),
    rule("gradual_onset_candidate", "symptoms.onsetPattern", "gradual", /逐渐|慢慢|一点点|越来越/),
    rule("worst_ever_candidate", "redFlags.worstEverHeadache", true, /有生以来.{0,8}(?:最严重|最痛|最疼)|这辈子.{0,8}(?:最严重|最痛|最疼)|最严重的一次/),
    rule("neurological_deficit_candidate", "redFlags.neurologicalDeficit", true, /(?:一侧|半边|左边|右边).{0,8}(?:无力|没劲|麻木)|嘴.{0,4}歪|口角.{0,4}歪|说话.{0,5}(?:不清|不利索)|言语不清|视物异常|看不清|复视/),
    rule("altered_consciousness_candidate", "redFlags.alteredConsciousness", true, /意识不清|神志不清|意识模糊|昏迷|昏过去|昏倒|叫不醒|失去意识|难以叫醒/),
    rule("recent_head_trauma_candidate", "redFlags.recentHeadTrauma", true, /撞到头|撞了头|摔到头|磕到头|头部受伤|头部外伤|外伤后.{0,8}头痛/),
  ]),
  CHEST_PAIN_V1: Object.freeze([
    rule("difficulty_breathing_candidate", "redFlags.difficultyBreathing", true, /喘不上气|喘不过[气汽]|呼吸困难|明显憋气|无法呼吸|吸不到空气/),
    rule("pressure_or_crushing_candidate", "redFlags.pressureOrCrushing", true, /(?:石头|重物).{0,8}(?:压|压着|压住)|压.{0,8}(?:石头|重物)|压榨|紧缩|胸口.{0,5}发紧|胸.{0,5}压迫|勒得慌|沉重/),
    rule("pain_radiation_candidate", "redFlags.painRadiation", true, /(?:疼|痛).{0,10}(?:扩散|放射|窜到).{0,10}(?:手臂|胳膊|肩|背|颈|脖子|下巴|下颌)|(?:手臂|胳膊|肩背|下巴|下颌).{0,6}(?:也痛|也疼)/),
    rule("collapse_or_sweating_candidate", "redFlags.collapseOrSweating", true, /晕厥|晕倒|晕过去|快要晕|差点晕|险些晕|冷汗|大汗|濒死感/),
    rule("persistent_severe_candidate", "symptoms.persistentSevere", true, /一直.{0,8}(?:很痛|很疼|不缓解|持续)|持续.{0,8}(?:很痛|很疼|不缓解)|(?:痛|疼).{0,5}一直不缓解/),
  ]),
});

const NEGATION = /没有|没|并无|无明显|不是|并非|否认|不伴|从未/;
const UNCERTAINTY = /好像|可能|也许|似乎|不太确定|不确定|说不准|记不清/;
const REFERENCE = /网上说|看到.{0,8}说|听说|例如|比如|别人说|资料说|[“”"']/;
const HYPOTHETICAL = /如果|假如|要是|万一/;
const OTHER_PERSON = /我朋友|我家人|家里人|同事|他|她|别人/;
const SELF_DENIAL_AFTER_REFERENCE = /(?:但|不过|可是).{0,10}(?:我|我自己).{0,8}(?:没有|没|并无|不是|不)/;

export class SafetySignalDetector {
  detect({ message, protocol }) {
    if (typeof message !== "string") {
      throw new TypeError("SafetySignalDetector requires message text.");
    }
    const pathway = typeof protocol === "string" ? protocol : protocol?.code;
    const rules = PATHWAY_RULES[pathway];
    if (!rules) return envelope(pathway ?? null, []);

    const candidates = [];
    for (const detectorRule of rules) {
      const match = detectorRule.pattern.exec(message);
      if (match) candidates.push(candidateFromMatch(message, detectorRule, match));
    }
    const fever = /发热|发烧|高烧/.exec(message);
    const neck = /(?:脖子|颈部).{0,8}(?:僵|硬|不能低头|难以低头|低不下去)/.exec(message);
    if (pathway === "HEADACHE_V1" && fever && neck) {
      const start = Math.min(fever.index, neck.index);
      const end = Math.max(fever.index + fever[0].length, neck.index + neck[0].length);
      candidates.push({
        signal: "fever_neck_stiffness_candidate",
        factPath: "redFlags.feverNeckStiffness",
        proposedValue: true,
        polarity: classifyPolarity(message, start, end),
        temporality: classifyTemporality(message, start, end),
        evidence: [evidence(fever), evidence(neck)],
        source: "deterministic_pattern",
      });
    }
    return envelope(pathway, deduplicate(candidates));
  }
}

export function isHighRiskSemanticPath(path) {
  return path?.startsWith("redFlags.") || [
    "symptoms.onsetPattern",
    "symptoms.suddenOnset",
    "symptoms.rapidPeak",
    "symptoms.persistentSevere",
  ].includes(path);
}

function rule(signal, factPath, proposedValue, pattern) {
  return Object.freeze({ signal, factPath, proposedValue, pattern });
}

function candidateFromMatch(message, detectorRule, match) {
  const crossSymptomOnset = ["symptoms.suddenOnset", "symptoms.onsetPattern"].includes(detectorRule.factPath) &&
    /头(?:痛|疼)以后.{0,16}(?:胳膊|手臂|肢体|说话).{0,8}突然/.test(message);
  return {
    signal: detectorRule.signal,
    factPath: detectorRule.factPath,
    proposedValue: detectorRule.proposedValue,
    polarity: crossSymptomOnset
      ? "contextual"
      : classifyPolarity(message, match.index, match.index + match[0].length),
    temporality: classifyTemporality(message, match.index, match.index + match[0].length),
    evidence: [evidence(match)],
    source: "deterministic_pattern",
  };
}

function classifyPolarity(message, start, end) {
  const nearby = message.slice(Math.max(0, start - 12), Math.min(message.length, end + 12));
  const negationContext = nearby.replaceAll("没劲", "无力");
  if (REFERENCE.test(message) && SELF_DENIAL_AFTER_REFERENCE.test(message)) return "negative";
  if (NEGATION.test(negationContext)) return "negative";
  if (UNCERTAINTY.test(nearby) || UNCERTAINTY.test(message)) return "uncertain";
  if (HYPOTHETICAL.test(nearby) || REFERENCE.test(message) || OTHER_PERSON.test(nearby)) return "contextual";
  return "positive";
}

function classifyTemporality(message, start, end) {
  const nearby = message.slice(Math.max(0, start - 16), Math.min(message.length, end + 16));
  if (/现在.{0,8}(?:已经不|没有|没)|已经.{0,8}(?:好了|缓解|消失|不疼|不痛)/.test(message)) return "resolved";
  if (/现在|正在|仍然|还在|今天/.test(nearby)) return "current";
  if (/刚才|刚刚|昨天|以前|曾经|之前|过了|过去了|叫醒/.test(nearby)) return "previous";
  if (/突然|一下子?|瞬间|几秒|一分(?:钟)?内|骤然/.test(nearby)) return "new_onset";
  return "unspecified";
}

function evidence(match) {
  return { text: match[0], start: match.index, end: match.index + match[0].length };
}

function deduplicate(candidates) {
  const seen = new Set();
  return candidates.filter((item) => {
    const key = `${item.factPath}:${JSON.stringify(item.proposedValue)}:${item.polarity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function envelope(pathway, candidates) {
  return {
    detectorVersion: SAFETY_SIGNAL_DETECTOR_VERSION,
    pathway,
    candidates: structuredClone(candidates),
  };
}
