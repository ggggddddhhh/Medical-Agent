import { getProtocol } from "../protocols/index.js";
import { isHighRiskSemanticPath } from "../semantic/safety-signal-detector.js";
import { sanitizeHybridValidation } from "../semantic/hybrid-semantic-validator.js";
import { evaluateSemanticPredictions } from "./semantic-metrics.js";
import { REAL_MODEL_DATASET_VERSION } from "./real-model-evaluator.js";

export const HYBRID_EVALUATION_VERSION = "phase-2a1-hybrid-evaluation-1.0.0";

export async function evaluateHybridRealModel({
  extractor,
  validator,
  goldCases,
  legacySentinels,
  phase2a1Sentinels = [],
  runs = 2,
  evaluationTimestamp = new Date().toISOString(),
}) {
  if (!extractor || typeof extractor.run !== "function") {
    throw new TypeError("evaluateHybridRealModel requires extractor.run.");
  }
  if (!validator || typeof validator.validate !== "function") {
    throw new TypeError("evaluateHybridRealModel requires validator.validate.");
  }
  if (!Number.isInteger(runs) || runs < 1) throw new TypeError("runs must be positive.");

  const dataset = [
    ...goldCases.map((item) => ({ ...item, datasetKind: "gold" })),
    ...legacySentinels.map((item) => ({ ...item, datasetKind: "legacy_sentinel" })),
    ...phase2a1Sentinels.map((item) => ({ ...item, datasetKind: "phase2a1_sentinel" })),
  ];
  const evaluated = [];

  for (let run = 1; run <= runs; run += 1) {
    for (const item of dataset) {
      const protocol = protocolFor(item.pathway);
      const extraction = await extractor.run({
        message: item.input,
        protocol,
        contextFacts: item.contextFacts,
      });
      const hybrid = await validator.validate({
        message: item.input,
        protocol,
        extraction,
        contextFacts: item.contextFacts,
      });
      evaluated.push({ item, run, extraction, hybrid });
    }
  }

  const comparable = evaluated.filter(({ item }) => item.datasetKind !== "phase2a1_sentinel");
  const legacySentinelRuns = comparable.filter(({ item }) => item.datasetKind === "legacy_sentinel");
  const phase2a1Runs = evaluated.filter(({ item }) => item.datasetKind === "phase2a1_sentinel");
  const baselineMetrics = evaluateSemanticPredictions(comparable.map(({ item, extraction }) => ({
    ...item,
    sentinel: item.datasetKind === "legacy_sentinel",
    prediction: extraction,
  })));
  const hybridMetrics = calculateHybridMetrics(comparable);
  const criticalSemanticMissesAfterGate = legacySentinelRuns.flatMap(findCriticalAfterGate);
  const legacySentinelPassedRuns = legacySentinelRuns.filter(passesLegacySentinel).length;
  const phase2a1SentinelPassedRuns = phase2a1Runs.filter(passesPhase2a1Sentinel).length;
  const extractionDriftCases = findDriftCases(comparable, extractionSignature);
  const gateDriftCases = findDriftCases(comparable, gateSignature);
  const providerFailureCount = comparable.filter(({ extraction }) =>
    ["timeout", "provider_error", "rate_limited", "empty_response"].includes(extraction.extractionStatus),
  ).length;
  const verifierFailureCount = comparable.flatMap(({ hybrid }) => hybrid.decisions)
    .filter((item) => item.verifier && item.verifier.status !== "completed").length;
  const legacySentinelPassRate = ratio(legacySentinelPassedRuns, legacySentinelRuns.length);
  const phase2a1SentinelPassRate = ratio(phase2a1SentinelPassedRuns, phase2a1Runs.length);
  const engineeringPass =
    criticalSemanticMissesAfterGate.length === 0 &&
    hybridMetrics.redFlagSafeRoutingRecall === 1 &&
    hybridMetrics.hallucinatedAcceptedFactRate === 0 &&
    legacySentinelPassRate === 1 &&
    phase2a1SentinelPassRate === 1 &&
    providerFailureCount === 0 &&
    verifierFailureCount === 0;

  return {
    evaluationVersion: HYBRID_EVALUATION_VERSION,
    baselineDatasetVersion: REAL_MODEL_DATASET_VERSION,
    phase2a1DatasetVersion: "phase-2a1-sentinels-1.0.0",
    evaluationTimestamp,
    provider: extractor.metadata.modelProvider,
    extractorModel: extractor.metadata.modelName,
    verifierModel: validator.metadata?.modelName ?? extractor.metadata.modelName,
    sameModelCorrelatedErrorRisk: true,
    schemaVersion: extractor.metadata.schemaVersion,
    promptVersion: extractor.metadata.promptVersion,
    mode: "shadow",
    runs,
    goldCases: goldCases.length,
    legacySentinelCases: legacySentinels.length,
    phase2a1SentinelCases: phase2a1Sentinels.length,
    comparableExecutions: comparable.length,
    additionalPhase2a1Executions: phase2a1Runs.length,
    baselineMetrics,
    hybridMetrics,
    legacySentinelPassRateAfterGate: legacySentinelPassRate,
    legacySentinelPassedRuns,
    phase2a1SentinelPassRate,
    phase2a1SentinelPassedRuns,
    criticalSemanticMissesAfterGate,
    extractionRunToRunDrift: extractionDriftCases.length > 0,
    extractionDriftCases,
    gateRunToRunDrift: gateDriftCases.length > 0,
    gateDriftCases,
    providerFailureCount,
    verifierFailureCount,
    clinicalStatus: "Clinical validation pending",
    verdict: engineeringPass ? "PASS_WITH_CONDITIONS" : "FAIL",
    phase2B: "NOT_READY",
    records: evaluated.map(sanitizeRecord),
  };
}

function calculateHybridMetrics(evaluated) {
  const totals = {
    decisions: 0,
    accepted: 0,
    correctAccepted: 0,
    rejected: 0,
    correctRejected: 0,
    uncertain: 0,
    detectorRedFlags: 0,
    detectedRedFlags: 0,
    redFlagConflicts: 0,
    caughtRedFlagConflicts: 0,
    baselineHallucinations: 0,
    blockedHallucinations: 0,
    verifierResolutions: 0,
    correctVerifierResolutions: 0,
    expectedUncertainties: 0,
    safelyRoutedUncertainties: 0,
    redFlags: 0,
    safelyRoutedRedFlags: 0,
    acceptedKnownFacts: 0,
    acceptedUnsupportedKnownFacts: 0,
  };

  for (const { item, extraction, hybrid } of evaluated) {
    const expected = new Map((item.expectedFacts ?? []).map((fact) => [fact.path, fact]));
    const decisions = new Map(hybrid.decisions.map((decision) => [decision.factPath, decision]));
    const predicted = new Map((extraction.candidate?.facts ?? []).map((fact) => [fact.path, fact]));
    totals.decisions += hybrid.decisions.length;
    for (const decision of hybrid.decisions) {
      const matches = gateFactMatches(decision.candidate, expected.get(decision.factPath));
      if (decision.decision === "ACCEPT") {
        totals.accepted += 1;
        if (matches) totals.correctAccepted += 1;
        if (decision.candidate?.status === "known") {
          totals.acceptedKnownFacts += 1;
          if (!matches) totals.acceptedUnsupportedKnownFacts += 1;
        }
      } else if (decision.decision === "REJECT") {
        totals.rejected += 1;
        if (!matches) totals.correctRejected += 1;
      } else {
        totals.uncertain += 1;
      }
      if (decision.verifier) {
        totals.verifierResolutions += 1;
        if (decision.verifier.verdict === expectedVerifierVerdict(decision.candidate, expected.get(decision.factPath))) {
          totals.correctVerifierResolutions += 1;
        }
      }
    }

    for (const expectedFact of item.expectedFacts ?? []) {
      if (expectedFact.path.startsWith("redFlags.")) {
        totals.redFlags += 1;
        if (safelyRoutes(decisions.get(expectedFact.path), expectedFact)) totals.safelyRoutedRedFlags += 1;
      }
      if (isDetectorTarget(expectedFact)) {
        totals.detectorRedFlags += 1;
        if (hasPositiveDetector(hybrid, expectedFact)) totals.detectedRedFlags += 1;
        if (!strictFactMatches(predicted.get(expectedFact.path), expectedFact) && hasPositiveDetector(hybrid, expectedFact)) {
          totals.redFlagConflicts += 1;
          if (["ACCEPT", "UNCERTAIN"].includes(decisions.get(expectedFact.path)?.decision)) {
            totals.caughtRedFlagConflicts += 1;
          }
        }
      }
    }
    for (const path of item.expectedUncertainties ?? []) {
      totals.expectedUncertainties += 1;
      if (decisions.get(path)?.decision === "UNCERTAIN") totals.safelyRoutedUncertainties += 1;
    }
    const expectedPaths = new Set((item.expectedFacts ?? []).map((fact) => fact.path));
    for (const fact of extraction.candidate?.facts ?? []) {
      if (fact.status === "known" && !expectedPaths.has(fact.path)) {
        totals.baselineHallucinations += 1;
        if (decisions.get(fact.path)?.decision !== "ACCEPT") totals.blockedHallucinations += 1;
      }
    }
  }

  return {
    semanticGateAcceptPrecision: ratio(totals.correctAccepted, totals.accepted),
    semanticGateRejectPrecision: ratio(totals.correctRejected, totals.rejected),
    semanticGateUncertainRate: ratio(totals.uncertain, totals.decisions),
    redFlagDetectorRecall: ratio(totals.detectedRedFlags, totals.detectorRedFlags),
    redFlagConflictCatchRate: ratio(totals.caughtRedFlagConflicts, totals.redFlagConflicts),
    hallucinationRejectionRate: ratio(totals.blockedHallucinations, totals.baselineHallucinations),
    verifierResolutionAccuracy: ratio(totals.correctVerifierResolutions, totals.verifierResolutions),
    uncertaintySafeRoutingAccuracy: ratio(totals.safelyRoutedUncertainties, totals.expectedUncertainties),
    redFlagSafeRoutingRecall: ratio(totals.safelyRoutedRedFlags, totals.redFlags),
    hallucinatedAcceptedFactRate: ratio(totals.acceptedUnsupportedKnownFacts, totals.acceptedKnownFacts),
    totals,
  };
}

function findCriticalAfterGate({ item, run, hybrid }) {
  const decisions = new Map(hybrid.decisions.map((decision) => [decision.factPath, decision]));
  return (item.expectedFacts ?? []).filter(isDetectorTarget).flatMap((expected) => {
    const decision = decisions.get(expected.path);
    if (decision?.decision === "ACCEPT" && gateFactMatches(decision.candidate, expected)) return [];
    if (decision?.decision === "UNCERTAIN" && decision.shadowFollowUpProposal) return [];
    return [{
      code: "CRITICAL_SEMANTIC_MISS_AFTER_GATE",
      caseId: item.id,
      run,
      path: expected.path,
      gateDecision: decision?.decision ?? "MISSING",
    }];
  });
}

function passesLegacySentinel(value) {
  return findCriticalAfterGate(value).length === 0 && !hasAcceptedUnsupportedHighRisk(value);
}

function passesPhase2a1Sentinel({ item, hybrid }) {
  const decisions = new Map(hybrid.decisions.map((decision) => [decision.factPath, decision]));
  for (const expected of item.gateExpectations ?? []) {
    const decision = decisions.get(expected.path);
    if (!decision || !expected.decisions.includes(decision.decision)) return false;
    if (decision.decision === "ACCEPT" && Object.hasOwn(expected, "value") &&
      JSON.stringify(decision.candidate?.value) !== JSON.stringify(expected.value)) return false;
    if (decision.decision === "UNCERTAIN" && !decision.shadowFollowUpProposal) return false;
  }
  if (item.forbidUnsupportedAccept) {
    const allowed = new Set(item.allowedAcceptPaths ?? []);
    if (hybrid.decisions.some((decision) => decision.decision === "ACCEPT" && !allowed.has(decision.factPath))) return false;
  }
  return true;
}

function hasAcceptedUnsupportedHighRisk({ item, hybrid }) {
  const expected = new Map((item.expectedFacts ?? []).map((fact) => [fact.path, fact]));
  const explicitlyUnknown = new Set(item.expectedUnknownFacts ?? []);
  return hybrid.decisions.some((decision) =>
    decision.decision === "ACCEPT" && isHighRiskSemanticPath(decision.factPath) &&
    (explicitlyUnknown.has(decision.factPath) ||
      (expected.has(decision.factPath) && !gateFactMatches(decision.candidate, expected.get(decision.factPath)))),
  );
}

function isDetectorTarget(fact) {
  return fact?.status === "known" && fact.value === true && isHighRiskSemanticPath(fact.path);
}

function hasPositiveDetector(hybrid, expected) {
  return hybrid.detector.candidates.some((candidate) =>
    candidate.factPath === expected.path && candidate.polarity === "positive" &&
    JSON.stringify(candidate.proposedValue) === JSON.stringify(expected.value),
  );
}

function safelyRoutes(decision, expected) {
  return Boolean(
    decision && (
      (decision.decision === "ACCEPT" && gateFactMatches(decision.candidate, expected)) ||
      decision.decision === "UNCERTAIN"
    ),
  );
}

function expectedVerifierVerdict(candidate, expected) {
  if (gateFactMatches(candidate, expected)) return "SUPPORTED";
  if (candidate?.status === "known" && expected?.status === "known" && candidate.value === !expected.value) {
    return "CONTRADICTED";
  }
  return "UNCERTAIN";
}

function gateFactMatches(actual, expected) {
  return Boolean(actual && expected && actual.status === expected.status &&
    JSON.stringify(actual.value) === JSON.stringify(expected.value) &&
    (expected.temporality === "unspecified" || !expected.temporality || actual.temporality === expected.temporality));
}

function strictFactMatches(actual, expected) {
  return Boolean(actual && expected && actual.status === expected.status &&
    JSON.stringify(actual.value) === JSON.stringify(expected.value) &&
    (!expected.temporality || actual.temporality === expected.temporality));
}

function findDriftCases(evaluated, signature) {
  const groups = new Map();
  for (const value of evaluated) {
    const signatures = groups.get(value.item.id) ?? [];
    signatures.push(signature(value));
    groups.set(value.item.id, signatures);
  }
  return [...groups].filter(([, signatures]) => new Set(signatures).size > 1).map(([caseId]) => caseId);
}

function extractionSignature({ extraction }) {
  return JSON.stringify({
    status: extraction.extractionStatus,
    validation: extraction.validationStatus,
    facts: [...(extraction.candidate?.facts ?? [])].map(compactFact).sort(byPath),
  });
}

function gateSignature({ hybrid }) {
  return JSON.stringify(hybrid.decisions.map((item) => ({
    path: item.factPath,
    decision: item.decision,
    candidate: compactFact(item.candidate),
  })).sort(byPath));
}

function compactFact(fact) {
  if (!fact) return null;
  return {
    path: fact.path,
    value: fact.value,
    status: fact.status,
    temporality: fact.temporality,
    contradictionCandidate: fact.contradictionCandidate,
  };
}

function byPath(left, right) {
  return (left?.path ?? "").localeCompare(right?.path ?? "");
}

function sanitizeRecord({ item, run, extraction, hybrid }) {
  return {
    caseId: item.id,
    datasetKind: item.datasetKind,
    category: item.category ?? null,
    pathway: item.pathway,
    run,
    extractionStatus: extraction.extractionStatus,
    validationStatus: extraction.validationStatus,
    errorCode: extraction.errorCode ?? null,
    modelSnapshot: extraction.providerResponseMetadata?.modelSnapshot ?? null,
    candidateFacts: structuredClone(extraction.candidate?.facts ?? []),
    hybrid: sanitizeHybridValidation(hybrid),
  };
}

function protocolFor(pathway) {
  const protocol = getProtocol(pathway === "HEADACHE_V1" ? "headache" : pathway === "CHEST_PAIN_V1" ? "chest_pain" : null);
  if (!protocol) throw new TypeError(`Unsupported pathway: ${pathway}`);
  return protocol;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}
