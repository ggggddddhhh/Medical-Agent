import { AgentAction, Disposition, POLICY_VERSION } from "../domain/constants.js";
import { isNegated } from "./extraction-helpers.js";

export const headacheProtocol = Object.freeze({
  code: "HEADACHE_V1",
  chiefComplaint: "headache",
  version: "1.1.0",
  displayName: "头痛",
  aliases: ["头痛", "头疼", "脑袋疼", "headache"],
  semanticFactSchema: Object.freeze({
    "chiefComplaint.code": { type: "enum", values: ["headache"] },
    "symptoms.onsetPattern": {
      type: "enum",
      values: ["sudden_severe", "gradual"],
    },
    "symptoms.suddenOnset": { type: "boolean" },
    "symptoms.rapidPeak": { type: "boolean" },
    "symptoms.durationMinutes": { type: "number", minimum: 0 },
    "symptoms.severity": { type: "integer", minimum: 0, maximum: 10 },
    "symptoms.activeNow": { type: "boolean" },
    "redFlags.neurologicalDeficit": { type: "boolean" },
    "redFlags.worstEverHeadache": { type: "boolean" },
    "redFlags.feverNeckStiffness": { type: "boolean" },
    "redFlags.alteredConsciousness": { type: "boolean" },
    "redFlags.recentHeadTrauma": { type: "boolean" },
    "relevantHistory.priorSimilarEpisode": { type: "boolean" },
  }),
  questions: [
    {
      id: "HEADACHE_ONSET",
      factPath: "symptoms.onsetPattern",
      parser: "onset_pattern",
      text: "这个头痛是突然在几秒到几分钟内达到最严重程度，还是逐渐出现的？",
    },
    {
      id: "HEADACHE_NEURO",
      factPath: "redFlags.neurologicalDeficit",
      parser: "boolean",
      text: "有没有同时出现一侧肢体无力或麻木、嘴歪、说话不清、视物异常？",
    },
    {
      id: "HEADACHE_FEVER_NECK",
      factPath: "redFlags.feverNeckStiffness",
      parser: "boolean",
      text: "有没有发热并伴随脖子僵硬、难以低头？",
    },
    {
      id: "HEADACHE_CONSCIOUSNESS",
      factPath: "redFlags.alteredConsciousness",
      parser: "boolean",
      text: "有没有意识模糊、失去意识、昏倒或难以叫醒的情况？",
    },
    {
      id: "HEADACHE_TRAUMA",
      factPath: "redFlags.recentHeadTrauma",
      parser: "boolean",
      text: "近期是否撞到头部，或头痛是在头部受伤后出现的？",
    },
    {
      id: "HEADACHE_SEVERITY",
      factPath: "symptoms.severity",
      parser: "severity",
      text: "如果 0 分是不痛、10 分是难以忍受，现在大约是几分？",
    },
  ],
  emergencyRules: [
    {
      id: "HEADACHE_THUNDERCLAP",
      when: (state) => state.symptoms.onsetPattern === "sudden_severe",
    },
    {
      id: "HEADACHE_FOCAL_NEUROLOGICAL_DEFICIT",
      when: (state) => state.redFlags.neurologicalDeficit === true,
    },
    {
      id: "HEADACHE_WORST_EVER",
      when: (state) => state.redFlags.worstEverHeadache === true,
    },
    {
      id: "HEADACHE_FEVER_NECK_STIFFNESS",
      when: (state) => state.redFlags.feverNeckStiffness === true,
    },
    {
      id: "HEADACHE_ALTERED_CONSCIOUSNESS",
      when: (state) => state.redFlags.alteredConsciousness === true,
    },
    {
      id: "HEADACHE_AFTER_HEAD_TRAUMA",
      when: (state) => state.redFlags.recentHeadTrauma === true,
    },
  ],
  extractDeterministicFacts(text) {
    const facts = { symptoms: {}, redFlags: {} };
    if (
      /(突然|一下|瞬间).*(最严重|剧烈|难以忍受|受不了)|雷击样|霹雳样|几秒.*最严重|几分钟.*最严重/.test(
        text,
      ) &&
      !isNegated(text, "突然|一下|瞬间|雷击样|霹雳样")
    ) {
      facts.symptoms.onsetPattern = "sudden_severe";
    } else if (/(逐渐|慢慢|一点点|越来越)/.test(text)) {
      facts.symptoms.onsetPattern = "gradual";
    }

    if (
      /(这辈子|有生以来|从来没有).*(最严重|这么痛|这么疼)|最严重的一次/.test(text) &&
      !isNegated(text, "最严重|这么痛|这么疼")
    ) {
      facts.redFlags.worstEverHeadache = true;
    }
    if (
      /(一侧|半边|左边|右边).*(无力|没劲|麻木)|嘴歪|口角歪|说话.*(不清|不利索)|言语不清|视物异常|看不清|复视/.test(
        text,
      ) &&
      !isNegated(text, "一侧|半边|左边|右边|嘴歪|口角歪|说话|言语|视物|复视")
    ) {
      facts.redFlags.neurologicalDeficit = true;
    }
    const fever = /(发热|发烧|高烧)/.test(text);
    const neckStiffness = /(脖子|颈部).*(僵|硬|不能低头|难以低头)/.test(text);
    if (fever && neckStiffness && !isNegated(text, "发热|发烧|高烧|脖子|颈部")) {
      facts.redFlags.feverNeckStiffness = true;
    }
    if (
      /(意识不清|神志不清|意识模糊|昏迷|叫不醒|失去意识)/.test(text) &&
      !isNegated(text, "意识|神志|昏迷|叫不醒")
    ) {
      facts.redFlags.alteredConsciousness = true;
    }
    if (
      /(撞到|撞了|摔到|磕到|头部受伤|外伤后).*(头|脑)|头.*(撞到|撞了|摔到|磕到)/.test(text) &&
      !isNegated(text, "撞到|撞了|摔到|磕到|头部受伤|外伤")
    ) {
      facts.redFlags.recentHeadTrauma = true;
    }
    return facts;
  },
  determineDisposition(state) {
    const severity = state.symptoms.severity;
    if (severity >= 7) {
      return disposition(
        Disposition.URGENT_SAME_DAY,
        "HEADACHE_HIGH_REPORTED_SEVERITY",
      );
    }
    if (severity <= 3) {
      return disposition(
        Disposition.SELF_MONITOR,
        "HEADACHE_LOW_SEVERITY_NO_PROTOCOL_RED_FLAGS",
      );
    }
    return disposition(
      Disposition.CLINIC_SOON,
      "HEADACHE_MODERATE_SEVERITY_NO_PROTOCOL_RED_FLAGS",
    );
  },
  department: "神经内科或全科门诊",
  warning:
    "如出现突然剧烈头痛、肢体无力、说话不清、意识异常或症状明显加重，请立即就医。",
});

function disposition(value, reasonCode) {
  return {
    action: AgentAction.DISPOSITION,
    disposition: value,
    reasonCodes: [reasonCode],
    policyVersion: POLICY_VERSION,
  };
}
