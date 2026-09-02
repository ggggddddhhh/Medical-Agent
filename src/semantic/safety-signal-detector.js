import { EvidenceSpanFinder } from "./evidence-span-finder.js";

export const SAFETY_SIGNAL_DETECTOR_VERSION = "safety-signal-detector-0.2.0";

const HIGH_RISK_PATHS = new Set([
  "symptoms.onsetPattern",
  "symptoms.suddenOnset",
  "symptoms.rapidPeak",
  "symptoms.persistentSevere",
  "redFlags.neurologicalDeficit",
  "redFlags.worstEverHeadache",
  "redFlags.feverNeckStiffness",
  "redFlags.alteredConsciousness",
  "redFlags.recentHeadTrauma",
  "redFlags.difficultyBreathing",
  "redFlags.pressureOrCrushing",
  "redFlags.painRadiation",
  "redFlags.collapseOrSweating",
]);

export class SafetySignalDetector {
  #spanFinder;

  constructor({ spanFinder = new EvidenceSpanFinder() } = {}) {
    this.#spanFinder = spanFinder;
  }

  detect({ message, protocol, evidenceSpans = null }) {
    if (typeof message !== "string") {
      throw new TypeError("SafetySignalDetector requires message text.");
    }
    const pathway = typeof protocol === "string" ? protocol : protocol?.code;
    const spans = evidenceSpans ?? this.#spanFinder.find({ message, protocol }).spans;
    const candidates = [];
    for (const span of spans) {
      for (const hint of span.conceptHints ?? []) {
        if (!isHighRiskSemanticPath(hint.factPath)) continue;
        candidates.push({
          signal: hint.conceptId + "_candidate",
          conceptId: hint.conceptId,
          factPath: hint.factPath,
          proposedValue: hint.proposedValue,
          group: hint.group ?? null,
          component: hint.component ?? null,
          evidence: [{ text: span.text, start: span.start, end: span.end }],
          source: "evidence_span_candidate",
        });
      }
    }
    return {
      detectorVersion: SAFETY_SIGNAL_DETECTOR_VERSION,
      pathway: pathway ?? null,
      candidates: deduplicate(candidates),
    };
  }
}

export function isHighRiskSemanticPath(path) {
  return HIGH_RISK_PATHS.has(path);
}

function deduplicate(candidates) {
  const seen = new Set();
  return candidates.filter((item) => {
    const evidence = item.evidence[0];
    const key = [item.conceptId, item.factPath, evidence.start, evidence.end].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
