import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  createDeepSeekV4FlashAdapter,
  evaluateSemanticRobustness,
  HybridSemanticValidator,
  SemanticExtractor,
  TargetedVerifier,
} from "../src/index.js";
import { phase2aGoldDataset, phase2aSemanticSentinels } from "../evaluation/phase-2a-gold-dataset.js";
import { phase2a1SemanticSentinels } from "../evaluation/phase-2a1-sentinels.js";
import { phase2a2DevelopmentVariants } from "../evaluation/phase-2a2-development-variants.js";
import { phase2a2BlindHoldoutCases } from "../evaluation/phase-2a2-blind-holdout.js";
import { phase2a2HoldoutSeal, phase2a2ProductionFreeze } from "../evaluation/phase-2a2-freeze-manifest.js";

const outputFile = new URL("../evaluation/results/deepseek-v4-flash-phase-2a2.json", import.meta.url);
if (existsSync(outputFile)) {
  throw new Error("Phase 2A.2 holdout result already exists. This script refuses to relabel a rerun as first blind holdout execution.");
}
verifyFreeze();

const adapter = createDeepSeekV4FlashAdapter();
const extractor = new SemanticExtractor({ provider: adapter, timeoutMs: 30_000 });
const verifier = new TargetedVerifier({ provider: adapter, timeoutMs: 30_000 });
const validator = new HybridSemanticValidator({ verifier });
let lastReported = 0;
const result = await evaluateSemanticRobustness({
  extractor,
  validator,
  baselineGold: phase2aGoldDataset,
  legacySentinels: phase2aSemanticSentinels,
  phase2a1Sentinels: phase2a1SemanticSentinels,
  developmentVariants: phase2a2DevelopmentVariants,
  holdoutCases: phase2a2BlindHoldoutCases,
  runs: 3,
  productionFreeze: phase2a2ProductionFreeze,
  holdoutSeal: phase2a2HoldoutSeal,
  onProgress({ completed, total }) {
    if (completed === total || completed - lastReported >= 20) {
      lastReported = completed;
      console.log(`Phase 2A.2 progress: ${completed}/${total}`);
    }
  },
});

mkdirSync(new URL("../evaluation/results/", import.meta.url), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  evaluationTimestamp: result.evaluationTimestamp,
  caseCounts: result.caseCounts,
  criticalSemanticMissCount: result.safetyMetrics.criticalSemanticMissCount,
  unsupportedAcceptCount: result.safetyMetrics.unsupportedAcceptCount,
  redFlagSafeRoutingRate: result.safetyMetrics.redFlagSafeRoutingRate,
  uncertaintySafeRoutingRate: result.safetyMetrics.uncertaintySafeRoutingRate,
  hallucinationRejectionRate: result.safetyMetrics.hallucinationRejectionRate,
  sentinelResults: result.sentinelResults,
  holdoutResults: result.holdoutResults,
  clinicalSemanticDrift: {
    extractor: result.clinicalSemanticDrift.extractor.casesWithDrift,
    gate: result.clinicalSemanticDrift.gate.casesWithDrift,
  },
  verifierAccuracy: result.verifierMetrics.accuracy,
  verdict: result.verdict,
  phase2B: result.phase2B,
}, null, 2));

function verifyFreeze() {
  for (const [path, expectedHash] of Object.entries(phase2a2ProductionFreeze.files)) {
    const actual = sha256(new URL(`../${path}`, import.meta.url));
    if (actual !== expectedHash) throw new Error(`Production freeze mismatch: ${path}`);
  }
  const holdoutHash = sha256(new URL("../evaluation/phase-2a2-blind-holdout.js", import.meta.url));
  if (holdoutHash !== phase2a2HoldoutSeal.datasetSha256) throw new Error("Blind Holdout seal mismatch.");
  if (phase2a2BlindHoldoutCases.length !== phase2a2HoldoutSeal.cases) throw new Error("Blind Holdout count mismatch.");
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
