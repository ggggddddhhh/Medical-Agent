import { isHighRiskSemanticPath } from "./safety-signal-detector.js";

export const CLARIFICATION_MANAGER_VERSION = "clarification-manager-0.1.0";

const FALLBACK_QUESTIONS = Object.freeze({
  "symptoms.suddenOnset": "请确认：这个头痛是否是您本人这次突然发生的？",
  "symptoms.rapidPeak": "请确认：这次头痛是否在几秒到几分钟内达到最严重？",
  "symptoms.persistentSevere": "请确认：这次胸痛是否仍在持续且没有缓解？",
  "redFlags.worstEverHeadache": "请确认：这是您本人有生以来最严重的一次头痛吗？",
  "redFlags.recentHeadTrauma": "请确认：您近期是否有头部外伤，并在之后出现头痛？",
});

export class ClarificationManager {
  create({ candidate, assertion, protocol, contextConflict = false }) {
    if (!candidate?.path || !isHighRiskSemanticPath(candidate.path)) return null;
    const reasons = [];
    if (!assertion) reasons.push("NO_GROUNDED_ASSERTION");
    if (assertion?.subject === "unclear") reasons.push("SUBJECT_UNCLEAR");
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
      question: questionFor(protocol, candidate.path),
    };
  }
}

function questionFor(protocol, path) {
  const exact = protocol.questions?.find((item) => item.factPath === path)?.text;
  if (exact) return exact;
  if (["symptoms.suddenOnset", "symptoms.rapidPeak"].includes(path)) {
    return protocol.questions?.find((item) => item.id === "HEADACHE_ONSET")?.text ??
      FALLBACK_QUESTIONS[path];
  }
  return FALLBACK_QUESTIONS[path] ??
    "请确认这项情况是否发生在您本人当前这次症状中：" + path;
}
