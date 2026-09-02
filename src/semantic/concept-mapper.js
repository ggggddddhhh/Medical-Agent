import { isHighRiskSemanticPath } from "./safety-signal-detector.js";

export const CONCEPT_MAPPER_VERSION = "concept-mapper-0.1.0";

export class ConceptMapper {
  map({ assertions, detectorCandidates = [], protocol }) {
    if (!Array.isArray(assertions) || !protocol?.semanticFactSchema) {
      throw new TypeError("ConceptMapper requires assertions and a protocol schema.");
    }
    const detectorKeys = new Set(detectorCandidates.map((item) => candidateKey(
      item.conceptId,
      item.factPath,
      item.evidence[0]?.start,
      item.evidence[0]?.end,
    )));
    const mentions = [];
    for (const assertion of assertions) {
      for (const hint of assertion.conceptHints ?? []) {
        if (!protocol.semanticFactSchema[hint.factPath]) continue;
        if (hint.factPath === "chiefComplaint.code" && assertion.explicitCorrection) continue;
        const evidence = assertion.evidence[0];
        if (
          isHighRiskSemanticPath(hint.factPath) &&
          !detectorKeys.has(candidateKey(hint.conceptId, hint.factPath, evidence?.start, evidence?.end))
        ) continue;
        mentions.push(mapMention(assertion, hint));
      }
    }

    const mappedFacts = [];
    for (const [path, pathMentions] of groupBy(mentions, (item) => item.fact.path)) {
      const mapped = path === "redFlags.feverNeckStiffness"
        ? mapFeverNeck(pathMentions)
        : aggregateMentions(pathMentions);
      if (mapped) mappedFacts.push(mapped);
    }
    return {
      conceptMapperVersion: CONCEPT_MAPPER_VERSION,
      mappedFacts,
    };
  }
}

function mapMention(assertion, hint) {
  const resolvedValue = resolveValue(hint.proposedValue, assertion.evidence[0]?.text ?? "");
  const uncertain = assertion.certainty === "uncertain";
  const value = assertion.polarity === "negative" && typeof resolvedValue === "boolean"
    ? false
    : resolvedValue;
  return {
    fact: {
      path: hint.factPath,
      value: uncertain ? null : value,
      status: uncertain ? "uncertain" : "known",
      confidence: uncertain ? 0.5 : 1,
      temporality: hint.conceptId === "active_resolved" ? "resolved" : assertion.temporality,
      contradictionCandidate: assertion.explicitCorrection,
    },
    assertion: structuredClone(assertion),
    conceptId: hint.conceptId,
    group: hint.group,
    component: hint.component,
  };
}

function mapFeverNeck(mentions) {
  const relevant = choosePatientMentions(mentions);
  const components = new Set(relevant.map((item) => item.component));
  const aggregate = mergeAssertion(relevant);
  let fact;
  if (relevant.some((item) => item.fact.value === false)) {
    fact = knownFact(relevant[0].fact.path, false, aggregate);
  } else if (relevant.some((item) => item.fact.status === "uncertain") || components.size < 2) {
    fact = uncertainFact(relevant[0].fact.path, aggregate);
  } else {
    fact = knownFact(relevant[0].fact.path, true, aggregate);
  }
  return mappedRecord(fact, aggregate, relevant);
}

function aggregateMentions(mentions) {
  const relevant = choosePatientMentions(mentions);
  const corrections = relevant.filter((item) => item.assertion.explicitCorrection);
  if (corrections.length > 0) {
    const latest = corrections.at(-1);
    return mappedRecord({ ...latest.fact, contradictionCandidate: true }, latest.assertion, [latest]);
  }
  const certain = relevant.filter((item) => item.fact.status === "known");
  const distinct = new Map(certain.map((item) => [JSON.stringify(item.fact.value), item.fact.value]));
  const aggregate = mergeAssertion(relevant);
  if (distinct.size > 1) {
    return mappedRecord({
      path: relevant[0].fact.path,
      value: [...distinct.values()],
      status: "conflicting",
      confidence: 0.5,
      temporality: mergeTemporality(relevant.map((item) => item.fact.temporality)),
      contradictionCandidate: true,
    }, { ...aggregate, polarity: "conflicting", certainty: "uncertain" }, relevant);
  }
  if (relevant.some((item) => item.fact.status === "uncertain")) {
    return mappedRecord(uncertainFact(relevant[0].fact.path, aggregate), aggregate, relevant);
  }
  const selected = certain.at(-1) ?? relevant.at(-1);
  return selected ? mappedRecord(selected.fact, aggregate, relevant) : null;
}

function choosePatientMentions(mentions) {
  const patient = mentions.filter((item) =>
    item.assertion.subject === "patient" && !item.assertion.quote && !item.assertion.hypothetical);
  return patient.length > 0 ? patient : mentions;
}

function mappedRecord(fact, assertion, mentions) {
  return {
    fact: structuredClone(fact),
    assertion: structuredClone(assertion),
    evidence: {
      evidenceVersion: "grounded-evidence-0.1.0",
      factPath: fact.path,
      support: mentions.every((item) => item.assertion.evidenceExact) ? "supporting" : "none",
      method: "evidence_span",
      temporality: assertion.temporality,
      evidence: mentions.flatMap((item) => item.assertion.evidence.map((span) => ({
        ...span,
        source: "evidence_span_finder",
        exact: item.assertion.evidenceExact,
      }))),
    },
    conceptIds: [...new Set(mentions.map((item) => item.conceptId))],
  };
}

function mergeAssertion(mentions) {
  return {
    assertionId: mentions.map((item) => item.assertion.assertionId).join("+"),
    spanId: mentions.map((item) => item.assertion.spanId).join("+"),
    evidenceExact: mentions.every((item) => item.assertion.evidenceExact),
    subject: commonValue(mentions.map((item) => item.assertion.subject), "unclear"),
    polarity: commonValue(mentions.map((item) => item.assertion.polarity), "conflicting"),
    certainty: mentions.some((item) => item.assertion.certainty === "uncertain") ? "uncertain" : "certain",
    temporality: mergeTemporality(mentions.map((item) => item.assertion.temporality)),
    quote: mentions.every((item) => item.assertion.quote),
    hypothetical: mentions.every((item) => item.assertion.hypothetical),
    explicitCorrection: mentions.some((item) => item.assertion.explicitCorrection),
    evidence: mentions.flatMap((item) => item.assertion.evidence),
  };
}

function knownFact(path, value, assertion) {
  return {
    path,
    value,
    status: "known",
    confidence: 1,
    temporality: assertion.temporality,
    contradictionCandidate: assertion.explicitCorrection,
  };
}

function uncertainFact(path, assertion) {
  return {
    path,
    value: null,
    status: "uncertain",
    confidence: 0.5,
    temporality: assertion.temporality,
    contradictionCandidate: assertion.explicitCorrection,
  };
}

function resolveValue(proposedValue, text) {
  if (proposedValue === "parse_duration") return parseDuration(text);
  if (proposedValue === "parse_severity") return Number(text.match(/10|[0-9]/)?.[0] ?? 0);
  return proposedValue;
}

function parseDuration(text) {
  const amountText = text.match(/\d+(?:\.\d+)?|一|两|三|四|五|六|七|八|九|十|半/)?.[0] ?? "0";
  const amount = Number.isFinite(Number(amountText)) ? Number(amountText) : ({
    一: 1, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5,
  }[amountText] ?? 0);
  if (/小时/.test(text)) return amount * 60;
  if (/天/.test(text)) return amount * 1440;
  if (/个月/.test(text)) return amount * 43_200;
  return amount;
}

function groupBy(values, selector) {
  const grouped = new Map();
  for (const value of values) {
    const key = selector(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

function commonValue(values, fallback) {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : fallback;
}

function mergeTemporality(values) {
  for (const preferred of ["resolved", "previous", "new_onset", "current", "chronic"]) {
    if (values.includes(preferred)) return preferred;
  }
  return "unspecified";
}

function candidateKey(conceptId, factPath, start, end) {
  return [conceptId, factPath, start, end].join(":");
}
