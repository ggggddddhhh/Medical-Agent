export function evaluateSemanticPredictions(cases) {
  const totals = {
    cases: cases.length,
    schemaValid: 0,
    expectedFacts: 0,
    predictedFacts: 0,
    predictedKnownFacts: 0,
    matchedFacts: 0,
    redFlags: 0,
    matchedRedFlags: 0,
    negations: 0,
    matchedNegations: 0,
    unknowns: 0,
    matchedUnknowns: 0,
    uncertainties: 0,
    matchedUncertainties: 0,
    conflicts: 0,
    matchedConflicts: 0,
    hallucinated: 0,
    sentinels: 0,
    passedSentinels: 0,
  };

  for (const item of cases) {
    const predictedFacts = item.prediction?.candidate?.facts ?? [];
    const predicted = new Map(predictedFacts.map((fact) => [fact.path, fact]));
    const expectedFacts = item.expectedFacts ?? [];
    if (item.prediction?.validationStatus === "valid") {
      totals.schemaValid += 1;
    }
    totals.expectedFacts += expectedFacts.length;
    const expectedPaths = new Set(expectedFacts.map((fact) => fact.path));
    for (const expected of expectedFacts) {
      const actual = predicted.get(expected.path);
      const matches = actual && sameExpectedFact(actual, expected);
      if (matches) totals.matchedFacts += 1;
      if (expected.path.startsWith("redFlags.")) {
        totals.redFlags += 1;
        if (matches) totals.matchedRedFlags += 1;
      }
    }
    const knownPredictions = predictedFacts.filter((fact) => fact.status === "known");
    totals.predictedFacts += predictedFacts.length;
    totals.predictedKnownFacts += knownPredictions.length;
    totals.hallucinated += knownPredictions.filter(
      (fact) => !expectedPaths.has(fact.path),
    ).length;
    scorePaths(totals, predicted, item.expectedNegations, "negations", "matchedNegations", (fact) => fact?.status === "known" && fact.value === false);
    scorePaths(totals, predicted, item.expectedUnknownFacts, "unknowns", "matchedUnknowns", (fact) => !fact || fact.status === "unknown");
    scorePaths(totals, predicted, item.expectedUncertainties, "uncertainties", "matchedUncertainties", (fact) => fact?.status === "uncertain");
    scorePaths(totals, predicted, item.expectedConflicts, "conflicts", "matchedConflicts", (fact) => fact?.status === "conflicting" || fact?.contradictionCandidate === true);
    if (item.sentinel) {
      totals.sentinels += 1;
      if (expectedFacts.every((expected) => sameExpectedFact(predicted.get(expected.path), expected))) {
        totals.passedSentinels += 1;
      }
    }
  }

  return {
    schemaValidityRate: ratio(totals.schemaValid, totals.cases),
    factPrecision: ratio(totals.matchedFacts, totals.predictedFacts),
    factRecall: ratio(totals.matchedFacts, totals.expectedFacts),
    redFlagFactRecall: ratio(totals.matchedRedFlags, totals.redFlags),
    negationAccuracy: ratio(totals.matchedNegations, totals.negations),
    unknownAccuracy: ratio(totals.matchedUnknowns, totals.unknowns),
    uncertaintyAccuracy: ratio(totals.matchedUncertainties, totals.uncertainties),
    hallucinatedFactRate: ratio(totals.hallucinated, totals.predictedKnownFacts),
    conflictDetectionAccuracy: ratio(totals.matchedConflicts, totals.conflicts),
    semanticSentinelPassRate: ratio(totals.passedSentinels, totals.sentinels),
    totals,
  };
}

function scorePaths(totals, predicted, paths = [], totalKey, matchKey, predicate) {
  totals[totalKey] += paths.length;
  totals[matchKey] += paths.filter((path) => predicate(predicted.get(path))).length;
}

function sameExpectedFact(actual, expected) {
  return Boolean(
    actual &&
      actual.status === expected.status &&
      JSON.stringify(actual.value) === JSON.stringify(expected.value) &&
      (!expected.temporality || actual.temporality === expected.temporality),
  );
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}
