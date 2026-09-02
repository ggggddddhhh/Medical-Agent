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
import { phase2a3BlindHoldoutCases } from "../evaluation/phase-2a3-blind-holdout.js";
import { phase2a3HoldoutSeal, phase2a3ProductionFreeze } from "../evaluation/phase-2a3-freeze-manifest.js";

const outputFile = new URL("../evaluation/results/deepseek-v4-flash-phase-2a3.json", import.meta.url);
if (existsSync(outputFile)) {
  throw new Error("Phase 2A.3 result already exists. The sealed Blind Holdout cannot be rerun or relabeled.");
}
verifyFreeze();

const adapter = createDeepSeekV4FlashAdapter();
const extractor = new SemanticExtractor({ provider: adapter, timeoutMs: 30_000 });
const verifier = new TargetedVerifier({ provider: adapter, timeoutMs: 30_000 });
const validator = new HybridSemanticValidator({ verifier });
let lastReported = 0;
const measured = await evaluateSemanticRobustness({
  extractor,
  validator,
  baselineGold: phase2aGoldDataset,
  legacySentinels: phase2aSemanticSentinels,
  phase2a1Sentinels: phase2a1SemanticSentinels,
  developmentVariants: phase2a2DevelopmentVariants,
  retainedHoldoutCases: phase2a2BlindHoldoutCases,
  holdoutCases: phase2a3BlindHoldoutCases,
  runs: 3,
  productionFreeze: phase2a3ProductionFreeze,
  holdoutSeal: phase2a3HoldoutSeal,
  onProgress({ completed, total }) {
    if (completed === total || completed - lastReported >= 20) {
      lastReported = completed;
      console.log("Phase 2A.3 progress: " + completed + "/" + total);
    }
  },
});
const baselineArtifact = JSON.parse(readFileSync(
  new URL("../evaluation/results/deepseek-v4-flash-phase-2a2.json", import.meta.url),
  "utf8",
));
const result = {
  ...measured,
  evaluationVersion: "phase-2a3-evidence-grounded-evaluation-1.0.0",
  phase2a2Baseline: {
    criticalSemanticMissCount: baselineArtifact.safetyMetrics.criticalSemanticMissCount,
    unsupportedAcceptCount: baselineArtifact.safetyMetrics.unsupportedAcceptCount,
    unsupportedAcceptRate: baselineArtifact.safetyMetrics.unsupportedAcceptRate,
    redFlagSafeRoutingRate: baselineArtifact.safetyMetrics.redFlagSafeRoutingRate,
    redFlags: baselineArtifact.safetyMetrics.redFlags,
    holdoutResults: baselineArtifact.holdoutResults,
  },
};

mkdirSync(new URL("../evaluation/results/", import.meta.url), { recursive: true });
writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  evaluationTimestamp: result.evaluationTimestamp,
  caseCounts: result.caseCounts,
  criticalSemanticMissCount: result.safetyMetrics.criticalSemanticMissCount,
  unsupportedAcceptCount: result.safetyMetrics.unsupportedAcceptCount,
  redFlagSafeRoutingRate: result.safetyMetrics.redFlagSafeRoutingRate,
  retainedHoldoutResults: result.retainedHoldoutResults,
  newHoldoutResults: result.holdoutResults,
  newHoldoutAssertionMetrics: result.assertionMetricsByDataset.blind_holdout,
  verdict: result.verdict,
  phase2B: result.phase2B,
}, null, 2));

function verifyFreeze() {
  for (const [path, expectedHash] of Object.entries(phase2a3ProductionFreeze.files)) {
    if (sha256(new URL("../" + path, import.meta.url)) !== expectedHash) {
      throw new Error("Production freeze mismatch: " + path);
    }
  }
  if (
    sha256(new URL("../evaluation/phase-2a3-blind-holdout.js", import.meta.url)) !==
    phase2a3HoldoutSeal.datasetSha256
  ) {
    throw new Error("Phase 2A.3 Blind Holdout seal mismatch.");
  }
  if (phase2a3BlindHoldoutCases.length !== phase2a3HoldoutSeal.cases) {
    throw new Error("Phase 2A.3 Blind Holdout count mismatch.");
  }
}

function sha256(file) {
  const normalized = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}
