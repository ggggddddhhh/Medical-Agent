import { mkdirSync, writeFileSync } from "node:fs";

import {
  createDeepSeekV4FlashAdapter,
  evaluateHybridRealModel,
  HybridSemanticValidator,
  SemanticExtractor,
  TargetedVerifier,
} from "../src/index.js";
import {
  phase2aGoldDataset,
  phase2aSemanticSentinels,
} from "../evaluation/phase-2a-gold-dataset.js";
import { phase2a1SemanticSentinels } from "../evaluation/phase-2a1-sentinels.js";

const runs = Number(process.env.DEEPSEEK_EVAL_RUNS ?? "2");
if (!Number.isInteger(runs) || runs < 1 || runs > 5) {
  throw new Error("DEEPSEEK_EVAL_RUNS must be an integer from 1 to 5.");
}

const adapter = createDeepSeekV4FlashAdapter();
const extractor = new SemanticExtractor({ provider: adapter, timeoutMs: 30_000 });
const verifier = new TargetedVerifier({ provider: adapter, timeoutMs: 30_000 });
const validator = new HybridSemanticValidator({ verifier });
const result = await evaluateHybridRealModel({
  extractor,
  validator,
  goldCases: phase2aGoldDataset,
  legacySentinels: phase2aSemanticSentinels,
  phase2a1Sentinels: phase2a1SemanticSentinels,
  runs,
});

const outputDirectory = new URL("../evaluation/results/", import.meta.url);
mkdirSync(outputDirectory, { recursive: true });
const outputFile = new URL("deepseek-v4-flash-phase-2a1.json", outputDirectory);
writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  provider: result.provider,
  extractorModel: result.extractorModel,
  verifierModel: result.verifierModel,
  runs: result.runs,
  comparableExecutions: result.comparableExecutions,
  additionalPhase2a1Executions: result.additionalPhase2a1Executions,
  baselineMetrics: result.baselineMetrics,
  hybridMetrics: result.hybridMetrics,
  legacySentinelPassRateAfterGate: result.legacySentinelPassRateAfterGate,
  phase2a1SentinelPassRate: result.phase2a1SentinelPassRate,
  criticalSemanticMissesAfterGate: result.criticalSemanticMissesAfterGate.length,
  extractionDriftCases: result.extractionDriftCases,
  gateDriftCases: result.gateDriftCases,
  providerFailureCount: result.providerFailureCount,
  verifierFailureCount: result.verifierFailureCount,
  verdict: result.verdict,
  phase2B: result.phase2B,
  outputFile: "evaluation/results/deepseek-v4-flash-phase-2a1.json",
}, null, 2));
