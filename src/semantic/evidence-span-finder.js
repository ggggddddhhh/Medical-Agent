import {
  CLINICAL_EVIDENCE_LEXICON_VERSION,
  clinicalEvidenceEntries,
} from "./clinical-evidence-lexicon.js";

export const EVIDENCE_SPAN_FINDER_VERSION = "evidence-span-finder-0.1.0";

export class EvidenceSpanFinder {
  find({ message, protocol }) {
    if (typeof message !== "string") {
      throw new TypeError("EvidenceSpanFinder requires message text.");
    }
    const pathway = typeof protocol === "string" ? protocol : protocol?.code;
    const found = [];
    for (const entry of clinicalEvidenceEntries(pathway)) {
      const pattern = new RegExp(entry.pattern, "giu");
      for (const match of message.matchAll(pattern)) {
        if (!match[0]) continue;
        found.push({
          text: match[0],
          start: match.index,
          end: match.index + match[0].length,
          conceptHint: {
            conceptId: entry.conceptId,
            factPath: entry.factPath,
            proposedValue: entry.proposedValue,
            group: entry.group ?? null,
            component: entry.component ?? null,
          },
        });
      }
    }

    const spans = mergeCoincidentSpans(found).map((span, index) => ({
      spanId: `span-${index + 1}`,
      text: span.text,
      start: span.start,
      end: span.end,
      exact: verifyEvidenceSpan(message, span),
      source: "clinical_lexicon",
      conceptHints: span.conceptHints,
    }));
    return {
      spanFinderVersion: EVIDENCE_SPAN_FINDER_VERSION,
      lexiconVersion: CLINICAL_EVIDENCE_LEXICON_VERSION,
      pathway: pathway ?? null,
      spans,
    };
  }
}

export function verifyEvidenceSpan(message, span) {
  return typeof message === "string" &&
    Number.isInteger(span?.start) &&
    Number.isInteger(span?.end) &&
    span.start >= 0 &&
    span.end > span.start &&
    span.end <= message.length &&
    message.slice(span.start, span.end) === span.text;
}

function mergeCoincidentSpans(found) {
  const grouped = new Map();
  for (const item of found) {
    const key = `${item.start}:${item.end}:${item.text}`;
    const existing = grouped.get(key) ?? {
      text: item.text,
      start: item.start,
      end: item.end,
      conceptHints: [],
    };
    if (!existing.conceptHints.some((hint) =>
      hint.conceptId === item.conceptHint.conceptId && hint.factPath === item.conceptHint.factPath)) {
      existing.conceptHints.push(item.conceptHint);
    }
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort((left, right) => left.start - right.start || left.end - right.end);
}
