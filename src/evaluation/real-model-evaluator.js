import { evaluateSemanticPredictions } from "./semantic-metrics.js";
import { getProtocol } from "../protocols/index.js";

export const REAL_MODEL_DATASET_VERSION = "phase-2a-semantic-dataset-1.0.0";

export async function evaluateRealModel({
  extractor,
  goldCases,
  sentinels,
  runs = 2,
  evaluationTimestamp = new Date().toISOString(),
}) {
  if (!extractor || typeof extractor.run !== "function") {
    throw new TypeError("evaluateRealModel requires a semantic extractor.");
  }
  if (!Number.isInteger(runs) || runs < 1) {
    throw new TypeError("runs must be a positive integer.");
  }

  const dataset = [
    ...goldCases.map((item) => ({ ...item, datasetKind: "gold" })),
    ...sentinels.map((item) => ({ ...item, datasetKind: "sentinel" })),
  ];
  const metricCases = [];
  const records = [];
  const criticalSemanticMisses = [];

  for (let run = 1; run <= runs; run += 1) {
    for (const item of dataset) {
      const protocol = protocolForPathway(item.pathway);
      const prediction = await extractor.run({
        message: item.input,
        protocol,
        contextFacts: item.contextFacts,
      });
      metricCases.push({ ...item, prediction });
      const record = sanitizeRecord(item, run, prediction);
      records.push(record);
      if (item.datasetKind === "sentinel") {
        criticalSemanticMisses.push(
          ...findCriticalSemanticMisses(item, run, prediction),
        );
      }
    }
  }

  const metrics = evaluateSemanticPredictions(metricCases);
  const providerFailures = records.filter((item) =>
    ["timeout", "provider_error", "rate_limited", "empty_response"].includes(
      item.extractionStatus,
    ),
  );
  const schemaFailures = records.filter(
    (item) => item.validationStatus === "invalid",
  );
  const driftCases = findDriftCases(records, runs);
  const sentinelIds = new Set(sentinels.map((item) => item.id));
  const passedSentinelIds = [...sentinelIds].filter((caseId) => {
    const caseRecords = records.filter((item) => item.caseId === caseId);
    return (
      caseRecords.length === runs &&
      !criticalSemanticMisses.some((miss) => miss.caseId === caseId) &&
      caseRecords.every((item) => item.sentinelPassed)
    );
  });
  const promotionMetricsPass =
    metrics.schemaValidityRate === 1 &&
    metrics.redFlagFactRecall === 1 &&
    metrics.negationAccuracy === 1 &&
    metrics.unknownAccuracy === 1 &&
    metrics.uncertaintyAccuracy === 1 &&
    metrics.semanticSentinelPassRate === 1 &&
    metrics.hallucinatedFactRate === 0 &&
    providerFailures.length === 0 &&
    schemaFailures.length === 0 &&
    criticalSemanticMisses.length === 0 &&
    driftCases.length === 0;

  return {
    evaluationVersion: "phase-2a-real-model-evaluation-1.0.0",
    datasetVersion: REAL_MODEL_DATASET_VERSION,
    evaluationTimestamp,
    provider: extractor.metadata.modelProvider,
    model: extractor.metadata.modelName,
    baseApiFormat: extractor.metadata.baseApiFormat,
    schemaVersion: extractor.metadata.schemaVersion,
    promptVersion: extractor.metadata.promptVersion,
    mode: "non-thinking",
    runs,
    goldCases: goldCases.length,
    sentinelCases: sentinels.length,
    goldExecutions: goldCases.length * runs,
    sentinelExecutions: sentinels.length * runs,
    metrics,
    passedSentinelCases: passedSentinelIds.length,
    criticalSemanticMisses,
    hallucinationCount: metrics.totals.hallucinated,
    schemaFailureCount: schemaFailures.length,
    providerFailureCount: providerFailures.length,
    runToRunDrift: driftCases.length > 0,
    driftCases,
    modelSnapshots: [
      ...new Set(records.map((item) => item.modelSnapshot).filter(Boolean)),
    ],
    clinicalStatus: "Clinical validation pending",
    verdict: promotionMetricsPass ? "PASS_WITH_CONDITIONS" : "FAIL",
    phase2B: "NOT_READY",
    records,
  };
}

function protocolForPathway(pathway) {
  const chiefComplaint =
    pathway === "HEADACHE_V1"
      ? "headache"
      : pathway === "CHEST_PAIN_V1"
        ? "chest_pain"
        : null;
  const protocol = chiefComplaint ? getProtocol(chiefComplaint) : null;
  if (!protocol) {
    throw new TypeError(`Unsupported evaluation pathway: ${pathway}`);
  }
  return protocol;
}

function sanitizeRecord(item, run, prediction) {
  return {
    caseId: item.id,
    datasetKind: item.datasetKind,
    pathway: item.pathway,
    run,
    extractionStatus: prediction.extractionStatus,
    validationStatus: prediction.validationStatus,
    errorCode: prediction.errorCode ?? null,
    modelSnapshot: prediction.providerResponseMetadata?.modelSnapshot ?? null,
    candidateFacts: structuredClone(prediction.candidate?.facts ?? []),
    sentinelPassed:
      item.datasetKind !== "sentinel" ||
      item.expectedFacts.every((expected) =>
        sameExpectedFact(
          prediction.candidate?.facts.find((fact) => fact.path === expected.path),
          expected,
        ),
      ),
  };
}

function findCriticalSemanticMisses(item, run, prediction) {
  const actualFacts = new Map(
    (prediction.candidate?.facts ?? []).map((fact) => [fact.path, fact]),
  );
  return item.expectedFacts
    .filter((fact) => isCriticalPath(fact.path))
    .flatMap((expected) => {
      const actual = actualFacts.get(expected.path);
      if (sameExpectedFact(actual, expected)) {
        return [];
      }
      return [
        {
          code: "CRITICAL_SEMANTIC_MISS",
          caseId: item.id,
          run,
          path: expected.path,
          failureType: classifyCriticalFailure(expected, actual),
        },
      ];
    });
}

function classifyCriticalFailure(expected, actual) {
  if (!actual) return "missed";
  if (["unknown", "uncertain", "refused"].includes(actual.status)) {
    return "incorrectly_changed_to_unknown";
  }
  if (
    expected.status === "known" &&
    typeof expected.value === "boolean" &&
    actual.status === "known" &&
    actual.value === !expected.value
  ) {
    return "hallucinated_opposite_fact";
  }
  return "incorrect_value_or_status";
}

function isCriticalPath(path) {
  return (
    path.startsWith("redFlags.") ||
    [
      "symptoms.suddenOnset",
      "symptoms.rapidPeak",
      "symptoms.persistentSevere",
    ].includes(path)
  );
}

function findDriftCases(records, runs) {
  if (runs < 2) return [];
  const caseIds = [...new Set(records.map((item) => item.caseId))];
  return caseIds.filter((caseId) => {
    const signatures = records
      .filter((item) => item.caseId === caseId)
      .map((item) => semanticSignature(item));
    return new Set(signatures).size > 1;
  });
}

function semanticSignature(record) {
  return JSON.stringify({
    extractionStatus: record.extractionStatus,
    validationStatus: record.validationStatus,
    facts: record.candidateFacts
      .map(({ path, value, status, temporality, contradictionCandidate }) => ({
        path,
        value,
        status,
        temporality,
        contradictionCandidate,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  });
}

function sameExpectedFact(actual, expected) {
  return Boolean(
    actual &&
      actual.status === expected.status &&
      JSON.stringify(actual.value) === JSON.stringify(expected.value) &&
      (!expected.temporality || actual.temporality === expected.temporality),
  );
}
