export const CLINICAL_ASSERTION_METRICS_VERSION = "clinical-assertion-metrics-0.1.0";

export function calculateClinicalAssertionMetrics(evaluated) {
  const totals = {
    evidenceSpanRecall: counter(),
    subjectAccuracy: counter(),
    negationAccuracy: counter(),
    certaintyAccuracy: counter(),
    temporalityAccuracy: counter(),
    conceptMappingAccuracy: counter(),
    clarificationTriggerRecall: counter(),
  };
  const errors = [];

  for (const { item, run, hybrid } of evaluated) {
    for (const expected of item.attributeExpectations ?? []) {
      const assertions = (hybrid.linguisticAssertions?.assertions ?? []).filter((assertion) =>
        assertion.conceptHints?.some((hint) => hint.factPath === expected.path));
      const assertion = expected.evidenceText
        ? assertions.find((value) => value.evidence.some((span) => span.text === expected.evidenceText))
        : assertions[0];
      score(totals.evidenceSpanRecall, Boolean(assertion?.evidenceExact), {
        item, run, module: "evidenceSpanRecall", expected, actual: assertion,
      }, errors);
      if (expected.subject) scoreAttribute(totals.subjectAccuracy, assertion, "subject", expected, item, run, errors);
      if (expected.polarity) scoreAttribute(totals.negationAccuracy, assertion, "polarity", expected, item, run, errors);
      if (expected.certainty) scoreAttribute(totals.certaintyAccuracy, assertion, "certainty", expected, item, run, errors);
      if (expected.temporality) scoreAttribute(totals.temporalityAccuracy, assertion, "temporality", expected, item, run, errors);
    }
    for (const expected of item.expectedMappings ?? []) {
      const mapped = hybrid.conceptMapping?.mappedFacts?.find((value) =>
        value.fact.path === expected.path);
      const correct = Boolean(mapped &&
        mapped.fact.status === expected.status &&
        JSON.stringify(mapped.fact.value) === JSON.stringify(expected.value) &&
        (!expected.temporality || mapped.fact.temporality === expected.temporality));
      score(totals.conceptMappingAccuracy, correct, {
        item, run, module: "conceptMappingAccuracy", expected, actual: mapped?.fact ?? null,
      }, errors);
    }
    for (const path of item.expectedClarifications ?? []) {
      const decision = hybrid.decisions.find((value) => value.factPath === path);
      score(totals.clarificationTriggerRecall, Boolean(
        decision?.clarification && decision?.shadowFollowUpProposal
      ), {
        item, run, module: "clarificationTriggerRecall", expected: { path },
        actual: decision?.decision ?? null,
      }, errors);
    }
  }

  return {
    metricsVersion: CLINICAL_ASSERTION_METRICS_VERSION,
    ...Object.fromEntries(Object.entries(totals).map(([name, value]) => [
      name,
      {
        correct: value.correct,
        total: value.total,
        rate: value.total === 0 ? null : value.correct / value.total,
      },
    ])),
    errors,
  };
}

function scoreAttribute(total, assertion, attribute, expected, item, run, errors) {
  score(total, assertion?.[attribute] === expected[attribute], {
    item,
    run,
    module: attribute,
    expected: { path: expected.path, value: expected[attribute] },
    actual: assertion?.[attribute] ?? null,
  }, errors);
}

function score(total, correct, detail, errors) {
  total.total += 1;
  if (correct) total.correct += 1;
  else errors.push({
    caseId: detail.item.id,
    datasetKind: detail.item.datasetKind,
    run: detail.run,
    module: detail.module,
    expected: sanitizeExpected(detail.expected),
    actual: sanitizeActual(detail.actual),
  });
}

function sanitizeExpected(expected) {
  if (!expected || typeof expected !== "object") return expected;
  return Object.fromEntries(Object.entries(expected).filter(([key]) =>
    key !== "evidenceText").map(([key, value]) => [key, structuredClone(value)]));
}

function sanitizeActual(actual) {
  if (!actual || typeof actual !== "object") return actual;
  if (Object.hasOwn(actual, "assertionId")) {
    return {
      subject: actual.subject,
      polarity: actual.polarity,
      certainty: actual.certainty,
      temporality: actual.temporality,
      quote: actual.quote,
      hypothetical: actual.hypothetical,
    };
  }
  return structuredClone(actual);
}

function counter() {
  return { correct: 0, total: 0 };
}
