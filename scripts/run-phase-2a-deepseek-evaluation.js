import { mkdirSync, writeFileSync } from "node:fs";

import {
  createDeepSeekV4FlashAdapter,
  SemanticExtractor,
} from "../src/index.js";
import { evaluateRealModel } from "../src/evaluation/real-model-evaluator.js";
import {
  phase2aGoldDataset,
  phase2aSemanticSentinels,
} from "../evaluation/phase-2a-gold-dataset.js";

const runs = Number(process.env.DEEPSEEK_EVAL_RUNS ?? "2");
if (!Number.isInteger(runs) || runs < 1 || runs > 5) {
  throw new Error("DEEPSEEK_EVAL_RUNS must be an integer from 1 to 5.");
}

const adapter = createDeepSeekV4FlashAdapter();
const extractor = new SemanticExtractor({
  provider: adapter,
  timeoutMs: 30_000,
});
const result = await evaluateRealModel({
  extractor,
  goldCases: phase2aGoldDataset,
  sentinels: phase2aSemanticSentinels,
  runs,
});

const outputDirectory = new URL("../evaluation/results/", import.meta.url);
mkdirSync(outputDirectory, { recursive: true });
const outputFile = new URL(
  "deepseek-v4-flash-phase-2a.json",
  outputDirectory,
);
writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      provider: result.provider,
      model: result.model,
      runs: result.runs,
      goldExecutions: result.goldExecutions,
      sentinelExecutions: result.sentinelExecutions,
      metrics: result.metrics,
      passedSentinelCases: result.passedSentinelCases,
      criticalSemanticMissCount: result.criticalSemanticMisses.length,
      hallucinationCount: result.hallucinationCount,
      schemaFailureCount: result.schemaFailureCount,
      providerFailureCount: result.providerFailureCount,
      runToRunDrift: result.runToRunDrift,
      driftCaseCount: result.driftCases.length,
      modelSnapshots: result.modelSnapshots,
      verdict: result.verdict,
      phase2B: result.phase2B,
      outputFile: "evaluation/results/deepseek-v4-flash-phase-2a.json",
    },
    null,
    2,
  ),
);
