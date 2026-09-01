import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRealModel,
  SEMANTIC_SCHEMA_VERSION,
  SemanticExtractor,
} from "../src/index.js";
import {
  expectedEnvelope,
  phase2aGoldDataset,
  phase2aSemanticSentinels,
} from "../evaluation/phase-2a-gold-dataset.js";

test("real-model evaluator runs 24 Gold and 8 Sentinels twice with ten metrics", async () => {
  const allCases = [...phase2aGoldDataset, ...phase2aSemanticSentinels];
  const extractor = fixtureExtractor(({ message }) => {
    const item = allCases.find((candidate) => candidate.input === message);
    return expectedEnvelope(item);
  });
  const result = await evaluateRealModel({
    extractor,
    goldCases: phase2aGoldDataset,
    sentinels: phase2aSemanticSentinels,
    runs: 2,
    evaluationTimestamp: "2026-09-01T00:00:00.000Z",
  });

  assert.equal(result.goldExecutions, 48);
  assert.equal(result.sentinelExecutions, 16);
  assert.equal(result.passedSentinelCases, 8);
  assert.equal(result.criticalSemanticMisses.length, 0);
  assert.equal(result.schemaFailureCount, 0);
  assert.equal(result.providerFailureCount, 0);
  assert.equal(result.runToRunDrift, false);
  assert.equal(result.verdict, "PASS_WITH_CONDITIONS");
  assert.equal(result.phase2B, "NOT_READY");
  assert.equal(result.metrics.semanticSentinelPassRate, 1);
  assert.equal(result.metrics.hallucinatedFactRate, 0);
  assert.equal(JSON.stringify(result).includes("input"), false);
});

test("critical sentinel misses are explicit and force FAIL", async () => {
  const sentinel = phase2aSemanticSentinels[0];
  const result = await evaluateRealModel({
    extractor: fixtureExtractor(() => ({
      schemaVersion: SEMANTIC_SCHEMA_VERSION,
      pathway: sentinel.pathway,
      facts: [],
    })),
    goldCases: [],
    sentinels: [sentinel],
    runs: 1,
  });
  assert.ok(result.criticalSemanticMisses.length > 0);
  assert.ok(result.criticalSemanticMisses.every((item) => item.code === "CRITICAL_SEMANTIC_MISS"));
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.phase2B, "NOT_READY");
});

test("run-to-run semantic drift is reported", async () => {
  const gold = phase2aGoldDataset[0];
  let call = 0;
  const result = await evaluateRealModel({
    extractor: fixtureExtractor(() => {
      call += 1;
      const output = expectedEnvelope(gold);
      if (call === 2) output.facts = output.facts.slice(0, 1);
      return output;
    }),
    goldCases: [gold],
    sentinels: [],
    runs: 2,
  });
  assert.equal(result.runToRunDrift, true);
  assert.deepEqual(result.driftCases, [gold.id]);
  assert.equal(result.verdict, "FAIL");
});

test("context facts are included only in the extraction instruction", async () => {
  let instruction;
  const item = phase2aGoldDataset.find((candidate) => candidate.contextFacts.length > 0);
  const extractor = new SemanticExtractor({
    provider: {
      name: "DeepSeek",
      model: "deepseek-v4-flash",
      baseApiFormat: "Responses API",
      generate(args) {
        instruction = args.systemInstruction;
        return expectedEnvelope(item);
      },
    },
  });
  await extractor.run({
    message: item.input,
    protocol: item.pathway === "HEADACHE_V1" ? protocol("headache") : protocol("chest_pain"),
    contextFacts: item.contextFacts,
  });
  assert.match(instruction, /Previously extracted structured facts/);
  assert.match(instruction, /onsetPattern|difficultyBreathing/);
});

function fixtureExtractor(generate) {
  return new SemanticExtractor({
    provider: {
      name: "DeepSeek",
      model: "deepseek-v4-flash",
      baseApiFormat: "Responses API",
      generate,
    },
  });
}

function protocol(chiefComplaint) {
  return chiefComplaint === "headache"
    ? phase2aProtocol("headache")
    : phase2aProtocol("chest_pain");
}

function phase2aProtocol(chiefComplaint) {
  const item = [...phase2aGoldDataset, ...phase2aSemanticSentinels].find(
    (candidate) =>
      candidate.pathway ===
      (chiefComplaint === "headache" ? "HEADACHE_V1" : "CHEST_PAIN_V1"),
  );
  return {
    code: item.pathway,
    semanticFactSchema: Object.fromEntries(
      [...phase2aGoldDataset, ...phase2aSemanticSentinels]
        .filter((candidate) => candidate.pathway === item.pathway)
        .flatMap((candidate) => candidate.expectedFacts)
        .map((fact) => [fact.path, inferDefinition(fact)]),
    ),
  };
}

function inferDefinition(fact) {
  const sample = Array.isArray(fact.value) ? fact.value[0] : fact.value;
  if (typeof sample === "boolean") return { type: "boolean" };
  if (typeof sample === "number") return { type: Number.isInteger(sample) ? "integer" : "number", minimum: 0, maximum: 1000000 };
  return { type: "enum", values: [sample].filter((value) => value !== null) };
}
