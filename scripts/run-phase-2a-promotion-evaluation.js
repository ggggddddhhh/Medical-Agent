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
import { phase2aPromotionSubjectHoldout } from "../evaluation/phase-2a-promotion-subject-holdout.js";
import {
  phase2aPromotionHoldoutSeal,
  phase2aPromotionProductionFreeze,
  phase2aPromotionRepeatedCaseIds,
} from "../evaluation/phase-2a-promotion-freeze-manifest.js";

const outputFile = new URL("../evaluation/results/deepseek-v4-flash-phase-2a-promotion.json", import.meta.url);
if (existsSync(outputFile)) {
  throw new Error("Promotion result already exists. The sealed Subject Blind Holdout cannot be rerun or relabeled.");
}
verifyFreeze();

const adapter = createDeepSeekV4FlashAdapter();
const extractor = new SemanticExtractor({ provider: adapter, timeoutMs: 30_000 });
const verifier = new TargetedVerifier({ provider: adapter, timeoutMs: 30_000 });
const validator = new HybridSemanticValidator({ verifier });
const repeated = new Set(phase2aPromotionRepeatedCaseIds);
const schedule = [
  ...phase2aPromotionSubjectHoldout.map((item) => scheduled(item, 1)),
  ...[2, 3].flatMap((run) => phase2aPromotionSubjectHoldout
    .filter((item) => repeated.has(item.id))
    .map((item) => scheduled(item, run))),
];
const evaluated = [];
for (const { item, run } of schedule) {
  const protocol = getProtocol(item.pathway === "HEADACHE_V1" ? "headache" : "chest_pain");
  const extraction = await extractor.run({ message: item.input, protocol, contextFacts: [] });
  const hybrid = await validator.validate({ message: item.input, protocol, extraction, contextFacts: [] });
  evaluated.push({ item, run, extraction, hybrid });
  console.log(`Subject promotion progress: ${evaluated.length}/${schedule.length}`);
}

const repeatedRecords = evaluated.filter(({ item }) => repeated.has(item.id));
const safetyMetrics = calculateSafetyMetrics(evaluated);
const assertionMetrics = calculateClinicalAssertionMetrics(evaluated);
const verifierMetrics = calculateVerifierMetrics(evaluated);
const clinicalSemanticDrift = calculateClinicalSemanticDrift(repeatedRecords, 3);
const directResolutionViolations = evaluated.flatMap(({ item, run, hybrid }) =>
  item.expectedUncertainties.flatMap((path) => {
    const decision = hybrid.decisions.find((value) => value.factPath === path);
    return decision?.decision === "UNCERTAIN" ? [] : [{
      caseId: item.id,
      run,
      path,
      decision: decision?.decision ?? "MISSING",
    }];
  }));
const providerFailureCount = evaluated.filter(({ extraction }) =>
  ["timeout", "provider_error", "rate_limited", "empty_response"].includes(extraction.extractionStatus)).length;
const verifierFailureCount = evaluated.flatMap(({ hybrid }) => hybrid.decisions)
  .filter((decision) => decision.verifier && decision.verifier.status !== "completed").length;
const caseIds = phase2aPromotionSubjectHoldout.map((item) => item.id);
const passedExecutions = evaluated.filter(passesExhaustiveCase).length;
const passedCases = caseIds.filter((id) => evaluated
  .filter(({ item }) => item.id === id)
  .every(passesExhaustiveCase)).length;
const criteria = {
  subjectAmbiguityNeverDirectlyResolved: directResolutionViolations.length === 0,
  clarificationTriggerRecallPerfect: assertionMetrics.clarificationTriggerRecall.rate === 1,
  unsupportedAcceptRemainsZero: safetyMetrics.unsupportedAcceptCount === 0,
  redFlagSafeRoutingPerfect: safetyMetrics.redFlagSafeRoutingRate === 1,
  gateDriftZero: clinicalSemanticDrift.gate.casesWithDrift === 0,
  verifierCannotPromoteWithoutEvidence: verifierMetrics.supportedWithoutEvidenceAccepted === 0,
  providersCompleted: providerFailureCount === 0 && verifierFailureCount === 0,
};
const ready = Object.values(criteria).every(Boolean);
const result = {
  evaluationVersion: "phase-2a-subject-promotion-evaluation-1.0.0",
  evaluationTimestamp: new Date().toISOString(),
  mode: "shadow",
  provider: extractor.metadata.modelProvider,
  extractorModel: extractor.metadata.modelName,
  verifierModel: validator.metadata.modelName,
  productionFreeze: phase2aPromotionProductionFreeze,
  holdoutSeal: phase2aPromotionHoldoutSeal,
  executionPlan: {
    blindHoldoutCases: phase2aPromotionSubjectHoldout.length,
    repeatedHighRiskCases: phase2aPromotionRepeatedCaseIds.length,
    repeatedRunsPerCase: 3,
    totalExecutions: schedule.length,
  },
  phase2a4Baseline: {
    clarificationTriggerRecall: { correct: 10, total: 13, rate: 10 / 13 },
    unsupportedAcceptCount: 0,
    redFlagSafeRoutingRate: 30 / 35,
    gateDriftCases: 0,
  },
  safetyMetrics,
  assertionMetrics,
  verifierMetrics,
  clinicalSemanticDrift,
  directResolutionViolations,
  holdoutResults: {
    passedExecutions,
    executions: evaluated.length,
    passRate: passedExecutions / evaluated.length,
    passedCases,
    cases: caseIds.length,
    casePassRate: passedCases / caseIds.length,
    failedCaseIds: caseIds.filter((id) => !evaluated
      .filter(({ item }) => item.id === id)
      .every(passesExhaustiveCase)),
  },
  providerFailureCount,
  verifierFailureCount,
  criteria,
  clinicalStatus: "Clinical validation pending",
  verdict: ready ? "COMPETITION_READY_FOR_PHASE_2B" : "NOT_READY",
  records: evaluated.map(sanitizeRobustnessRecord),
};

mkdirSync(new URL("../evaluation/results/", import.meta.url), { recursive: true });
writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  executionPlan: result.executionPlan,
  safetyMetrics: result.safetyMetrics,
  assertionMetrics: result.assertionMetrics,
  clinicalSemanticDrift: result.clinicalSemanticDrift,
  directResolutionViolations: result.directResolutionViolations,
  holdoutResults: result.holdoutResults,
  criteria: result.criteria,
  verdict: result.verdict,
}, null, 2));

function scheduled(item, run) {
  return { item: { ...item, datasetKind: "blind_holdout" }, run };
}

function verifyFreeze() {
  for (const [path, expected] of Object.entries(phase2aPromotionProductionFreeze.files)) {
    if (hash(new URL("../" + path, import.meta.url)) !== expected) {
      throw new Error("Promotion production freeze mismatch: " + path);
    }
  }
  if (hash(new URL("../evaluation/phase-2a-promotion-subject-holdout.js", import.meta.url)) !== phase2aPromotionHoldoutSeal.datasetSha256) {
    throw new Error("Promotion Subject Blind Holdout seal mismatch.");
  }
}

function hash(file) {
  const normalized = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}
