import { isHighRiskSemanticPath } from "./safety-signal-detector.js";

export const CLARIFICATION_MANAGER_VERSION = "clarification-manager-0.2.0";

const FALLBACK_QUESTIONS = Object.freeze({
  "symptoms.suddenOnset": "请确认：这个头痛是否是您本人这次突然发生的？",
  "symptoms.rapidPeak": "请确认：这次头痛是否在几秒到几分钟内达到最严重？",
  "symptoms.persistentSevere": "请确认：这次胸痛是否仍在持续且没有缓解？",
  "redFlags.worstEverHeadache": "请确认：这是您本人有生以来最严重的一次头痛吗？",
  "redFlags.recentHeadTrauma": "请确认：您近期是否有头部外伤，并在之后出现头痛？",
});

export class ClarificationManager {
  create({ candidate, assertion, protocol, contextConflict = false }) {
    const subjectUncertain = assertion?.subject === "unclear";
    if (!candidate?.path || (!isHighRiskSemanticPath(candidate.path) && !subjectUncertain)) {
      return null;
    }
    const reasons = [];
    if (!assertion) reasons.push("NO_GROUNDED_ASSERTION");
    if (subjectUncertain) reasons.push("SUBJECT_UNCERTAIN");
    if (assertion?.certainty === "uncertain" || candidate.status === "uncertain") {
      reasons.push("CERTAINTY_UNCLEAR");
    }
    if (assertion?.temporality === "unspecified") reasons.push("TEMPORALITY_UNCLEAR");
    if (
      assertion?.polarity === "conflicting" ||
      candidate.status === "conflicting" ||
      contextConflict
    ) reasons.push("ASSERTION_CONFLICT");
    if (reasons.length === 0) return null;
    return {
      clarificationManagerVersion: CLARIFICATION_MANAGER_VERSION,
      factPath: candidate.path,
      reasonCodes: reasons,
      question: questionFor(protocol, candidate, reasons),
    };
  }
}

function questionFor(protocol, candidate, reasons) {
  const path = candidate.path;
  if (reasons.includes("SUBJECT_UNCERTAIN")) {
    return `请确认，${subjectLabel(candidate)}的是您本人还是您提到的其他人？`;
  }
  const exact = protocol.questions?.find((item) => item.factPath === path)?.text;
  if (exact) return exact;
  if (["symptoms.suddenOnset", "symptoms.rapidPeak"].includes(path)) {
    return protocol.questions?.find((item) => item.id === "HEADACHE_ONSET")?.text ??
      FALLBACK_QUESTIONS[path];
  }
  return FALLBACK_QUESTIONS[path] ??
    "请确认这项情况是否发生在您本人当前这次症状中：" + path;
}

function subjectLabel(candidate) {
  if (candidate.path === "chiefComplaint.code") {
    return candidate.value === "headache" ? "头痛" : "胸痛";
  }
  return ({
    "symptoms.suddenOnset": "突然头痛",
    "symptoms.rapidPeak": "头痛快速达到最严重",
    "symptoms.persistentSevere": "持续严重胸痛",
    "redFlags.neurologicalDeficit": "肢体无力、麻木、嘴歪或说话不清",
    "redFlags.worstEverHeadache": "有生以来最严重的头痛",
    "redFlags.feverNeckStiffness": "发热伴脖子僵硬",
    "redFlags.alteredConsciousness": "意识异常",
    "redFlags.recentHeadTrauma": "近期头部外伤",
    "redFlags.difficultyBreathing": "呼吸困难",
    "redFlags.pressureOrCrushing": "胸口压迫或紧缩不适",
    "redFlags.painRadiation": "胸痛向其他部位放射",
    "redFlags.collapseOrSweating": "晕倒或出冷汗",
  })[candidate.path] ?? "这项症状";
}
