import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  createDeepSeekV4FlashAdapter,
  HybridSemanticValidator,
  SemanticExtractor,
  TargetedVerifier,
} from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";
import { calculateClinicalAssertionMetrics } from "../src/evaluation/clinical-assertion-metrics.js";
import {
  calculateClinicalSemanticDrift,
  calculateSafetyMetrics,
  calculateVerifierMetrics,
  passesExhaustiveCase,
  sanitizeRobustnessRecord,
} from "../src/evaluation/semantic-robustness-evaluator.js";
import { phase2a4CriticalRegressions } from "../evaluation/phase-2a4-critical-regressions.js";
import { phase2a4BlindHoldoutCases } from "../evaluation/phase-2a4-blind-holdout.js";
import {
  phase2a4HoldoutSeal,
  phase2a4ProductionFreeze,
  phase2a4RepeatedHighRiskCaseIds,
} from "../evaluation/phase-2a4-freeze-manifest.js";

const outputFile = new URL("../evaluation/results/deepseek-v4-flash-phase-2a4.json", import.meta.url);
if (existsSync(outputFile)) {
  throw new Error("Phase 2A.4 result already exists. The sealed Blind Holdout cannot be rerun or relabeled.");
}
verifyFreeze();

const adapter = createDeepSeekV4FlashAdapter();
const extractor = new SemanticExtractor({ provider: adapter, timeoutMs: 30_000 });
const verifier = new TargetedVerifier({ provider: adapter, timeoutMs: 30_000 });
const validator = new HybridSemanticValidator({ verifier });
const repeated = new Set(phase2a4RepeatedHighRiskCaseIds);
const schedule = [
  ...phase2a4CriticalRegressions.map((item) => scheduled(item, "regression", 1)),
  ...phase2a4BlindHoldoutCases.map((item) => scheduled(item, "blind_holdout", 1)),
  ...[2, 3].flatMap((run) => phase2a4BlindHoldoutCases
    .filter((item) => repeated.has(item.id))
    .map((item) => scheduled(item, "blind_holdout", run))),
];
const evaluated = [];
for (const { item, run } of schedule) {
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
  if (evaluated.length % 10 === 0 || evaluated.length === schedule.length) {
    console.log(`Phase 2A.4 progress: ${evaluated.length}/${schedule.length}`);
  }
}

const regressionRecords = evaluated.filter(({ item }) => item.datasetKind === "regression");
const blindRecords = evaluated.filter(({ item }) => item.datasetKind === "blind_holdout");
const repeatedRecords = blindRecords.filter(({ item }) => repeated.has(item.id));
const safetyMetrics = calculateSafetyMetrics(evaluated);
const safetyMetricsByDataset = {
  regression: calculateSafetyMetrics(regressionRecords),
  blind_holdout: calculateSafetyMetrics(blindRecords),
};
const assertionMetricsByDataset = {
  regression: calculateClinicalAssertionMetrics(regressionRecords),
  blind_holdout: calculateClinicalAssertionMetrics(blindRecords),
};
const verifierMetrics = calculateVerifierMetrics(evaluated);
const clinicalSemanticDrift = calculateClinicalSemanticDrift(repeatedRecords, 3);
const providerFailureCount = evaluated.filter(({ extraction }) =>
  ["timeout", "provider_error", "rate_limited", "empty_response"].includes(extraction.extractionStatus)).length;
const verifierFailureCount = evaluated.flatMap(({ hybrid }) => hybrid.decisions)
  .filter((decision) => decision.verifier && decision.verifier.status !== "completed").length;
const schemaInvalidCount = evaluated.filter(({ extraction }) => extraction.validationStatus !== "valid").length;
const phase2a3 = JSON.parse(readFileSync(
  new URL("../evaluation/results/deepseek-v4-flash-phase-2a3.json", import.meta.url),
  "utf8",
));
const blindCriticalPerExecution = safetyMetricsByDataset.blind_holdout.criticalSemanticMissCount / blindRecords.length;
const criteria = {
  regressionCriticalImproved: safetyMetricsByDataset.regression.criticalSemanticMissCount < 48,
  regressionUnsupportedImproved: safetyMetricsByDataset.regression.unsupportedAcceptCount < 15,
  blindCriticalImproved: blindCriticalPerExecution < 51 / 120,
  blindUnsupportedImproved:
    (safetyMetricsByDataset.blind_holdout.unsupportedAcceptRate ?? 0) < 0.18518518518518517,
  redFlagAboveSingleLlmBaseline: safetyMetricsByDataset.blind_holdout.redFlagSafeRoutingRate > 0.5,
  clarificationStable:
    assertionMetricsByDataset.blind_holdout.clarificationTriggerRecall.rate === 1,
  gateDriftControlled: clinicalSemanticDrift.gate.casesWithDrift === 0,
  verifierCannotPromoteWithoutEvidence: verifierMetrics.supportedWithoutEvidenceAccepted === 0,
  providersCompleted: providerFailureCount === 0 && verifierFailureCount === 0,
};
const competitionReady = Object.values(criteria).every(Boolean);
const result = {
  evaluationVersion: "phase-2a4-competition-evaluation-1.0.0",
  evaluationTimestamp: new Date().toISOString(),
  mode: "shadow",
  provider: extractor.metadata.modelProvider,
  extractorModel: extractor.metadata.modelName,
  verifierModel: validator.metadata.modelName,
  productionFreeze: phase2a4ProductionFreeze,
  holdoutSeal: phase2a4HoldoutSeal,
  executionPlan: {
    regressionCases: phase2a4CriticalRegressions.length,
    blindHoldoutCases: phase2a4BlindHoldoutCases.length,
    repeatedHighRiskCases: phase2a4RepeatedHighRiskCaseIds.length,
    repeatedRunsPerCase: 3,
    totalExecutions: schedule.length,
  },
  developmentBaseline: {
    sourceCommit: "ec5f9fbca710d5490bbd966d6ea344171cced9e3",
    criticalSemanticMissCount: 48,
    unsupportedAcceptCount: 15,
    redFlags: { safelyRouted: 21, total: 69 },
    evidenceSpanRecall: { correct: 9, total: 87 },
    subjectAccuracy: { correct: 9, total: 87 },
    certaintyAccuracy: { correct: 6, total: 87 },
    temporalityAccuracy: { correct: 6, total: 87 },
    clarificationTriggerRecall: { correct: 18, total: 21 },
  },
  phase2a3BlindBaseline: {
    executions: phase2a3.holdoutResults.executions,
    criticalSemanticMissCount: phase2a3.safetyMetricsByDataset.blind_holdout.criticalSemanticMissCount,
    unsupportedAcceptCount: phase2a3.safetyMetricsByDataset.blind_holdout.unsupportedAcceptCount,
    unsupportedAcceptRate: phase2a3.safetyMetricsByDataset.blind_holdout.unsupportedAcceptRate,
    redFlagSafeRoutingRate: phase2a3.safetyMetricsByDataset.blind_holdout.redFlagSafeRoutingRate,
    assertionMetrics: phase2a3.assertionMetricsByDataset.blind_holdout,
  },
  safetyMetrics,
  safetyMetricsByDataset,
  assertionMetricsByDataset,
  verifierMetrics,
  clinicalSemanticDrift,
  regressionResults: summarize(regressionRecords),
  blindHoldoutResults: summarize(blindRecords),
  providerFailureCount,
  verifierFailureCount,
  schemaInvalidCount,
  criteria,
  clinicalStatus: "Clinical validation pending",
  verdict: competitionReady ? "COMPETITION_READY_FOR_PHASE_2B" : "NOT_READY",
  records: evaluated.map(sanitizeRobustnessRecord),
};

mkdirSync(new URL("../evaluation/results/", import.meta.url), { recursive: true });
writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  evaluationTimestamp: result.evaluationTimestamp,
  executionPlan: result.executionPlan,
  safetyMetricsByDataset: result.safetyMetricsByDataset,
  assertionMetricsByDataset: result.assertionMetricsByDataset,
  clinicalSemanticDrift: result.clinicalSemanticDrift,
  regressionResults: result.regressionResults,
  blindHoldoutResults: result.blindHoldoutResults,
  criteria: result.criteria,
  verdict: result.verdict,
}, null, 2));

function scheduled(item, datasetKind, run) {
  return { item: { ...item, datasetKind }, run };
}

function summarize(records) {
  const ids = [...new Set(records.map(({ item }) => item.id))];
  const passedExecutions = records.filter(passesExhaustiveCase).length;
  const passedCases = ids.filter((id) => records
    .filter(({ item }) => item.id === id)
    .every(passesExhaustiveCase)).length;
  return {
    passedExecutions,
    executions: records.length,
    passRate: passedExecutions / records.length,
    passedCases,
    cases: ids.length,
    casePassRate: passedCases / ids.length,
    failedCaseIds: ids.filter((id) => !records
      .filter(({ item }) => item.id === id)
      .every(passesExhaustiveCase)),
  };
}

function protocolFor(pathway) {
  return getProtocol(pathway === "HEADACHE_V1" ? "headache" : "chest_pain");
}

function verifyFreeze() {
  for (const [path, expected] of Object.entries(phase2a4ProductionFreeze.files)) {
    if (hash(new URL("../" + path, import.meta.url)) !== expected) {
      throw new Error("Phase 2A.4 production freeze mismatch: " + path);
    }
  }
  if (hash(new URL("../evaluation/phase-2a4-blind-holdout.js", import.meta.url)) !== phase2a4HoldoutSeal.datasetSha256) {
    throw new Error("Phase 2A.4 Blind Holdout seal mismatch.");
  }
}

function hash(file) {
  const normalized = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}
