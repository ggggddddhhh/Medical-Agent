export const FACT_EVIDENCE_VERSION = "fact-evidence-0.1.0";

const DIRECT_PATTERNS = Object.freeze({
  "chiefComplaint.code": /头痛|头疼|脑袋疼|脑壳疼|胸痛|胸疼|胸口不舒服|胸口疼|心口痛/,
  "symptoms.durationMinutes": /(?:持续|已经|有|疼了|痛了)?\s*(?:\d+(?:\.\d+)?|一|两|三|四|五|六|七|八|九|十|半)\s*(?:分钟|小时|天|个月)/,
  "symptoms.severity": /(?:大约|大概|差不多|是)?\s*(?:10|[0-9])\s*分/,
  "symptoms.activeNow": /现在.{0,8}(?:还在|仍然|不疼|不痛|没有)|今天也有|已经不疼|已经不痛/,
  "symptoms.onsetPattern": /突然|一下子?|瞬间|雷击样|霹雳样|逐渐|慢慢|一点点|越来越/,
  "relevantHistory.priorSimilarEpisode": /以前也|之前也|曾经也/,
});

export function findFactEvidence({ message, fact, detectorCandidates = [] }) {
  if (typeof message !== "string" || !fact?.path) return emptyEvidence(fact?.path ?? null);
  const detectorEvidence = detectorCandidates
    .filter((candidate) => candidate.factPath === fact.path && supportsFact(candidate, fact))
    .flatMap((candidate) => candidate.evidence.map((item) => ({ ...item, source: candidate.source })));
  if (detectorEvidence.length > 0) {
    const detectorTemporalities = detectorCandidates
      .filter((candidate) => candidate.factPath === fact.path && supportsFact(candidate, fact))
      .map((candidate) => candidate.temporality)
      .filter((value) => value !== "unspecified");
    const temporality = new Set(detectorTemporalities).size === 1
      ? detectorTemporalities[0]
      : "unspecified";
    return evidenceRecord(fact.path, "supporting", detectorEvidence, "detector", temporality);
  }
  const match = DIRECT_PATTERNS[fact.path]?.exec(message);
  if (match) {
    return evidenceRecord(fact.path, "supporting", [{
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      source: "direct_text_pattern",
    }], "direct_text", evidenceTemporality(message, fact.path));
  }
  return emptyEvidence(fact.path);
}

function supportsFact(candidate, fact) {
  if (fact.status === "uncertain") return candidate.polarity === "uncertain";
  if (fact.status !== "known") return false;
  if (fact.value === true) return candidate.polarity === "positive";
  if (fact.value === false) return candidate.polarity === "negative";
  return candidate.polarity === "positive" && candidate.proposedValue === fact.value;
}

function evidenceRecord(factPath, support, evidence, method, temporality = "unspecified") {
  return {
    evidenceVersion: FACT_EVIDENCE_VERSION,
    factPath,
    support,
    method,
    temporality,
    evidence: structuredClone(evidence),
  };
}

function emptyEvidence(factPath) {
  return evidenceRecord(factPath, "none", [], "none");
}

function evidenceTemporality(message, factPath) {
  if (factPath === "symptoms.activeNow" && /现在.{0,8}(?:已经不|不疼|不痛|没有)|已经.{0,8}(?:不疼|不痛|好了|缓解|消失)/.test(message)) {
    return "resolved";
  }
  if (/现在|正在|仍然|还在|今天也有/.test(message)) return "current";
  if (/昨天|以前|曾经|之前|刚才|刚刚/.test(message)) return "previous";
  return "unspecified";
}
