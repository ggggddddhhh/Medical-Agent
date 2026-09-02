import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { validateExtractionEnvelope } from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";
import { phase2aGoldDataset, phase2aSemanticSentinels } from "../evaluation/phase-2a-gold-dataset.js";
import { phase2a1SemanticSentinels } from "../evaluation/phase-2a1-sentinels.js";
import { phase2a2DevelopmentVariants } from "../evaluation/phase-2a2-development-variants.js";
import { phase2a2BlindHoldoutCases } from "../evaluation/phase-2a2-blind-holdout.js";
import { phase2a3BlindHoldoutCases } from "../evaluation/phase-2a3-blind-holdout.js";
import { phase2a4CriticalRegressions } from "../evaluation/phase-2a4-critical-regressions.js";
import { phase2a4BlindHoldoutCases } from "../evaluation/phase-2a4-blind-holdout.js";
import {
  phase2a4HoldoutSeal,
  phase2a4ProductionFreeze,
  phase2a4RepeatedHighRiskCaseIds,
} from "../evaluation/phase-2a4-freeze-manifest.js";
import { phase2a3ProductionFreeze } from "../evaluation/phase-2a3-freeze-manifest.js";

test("Phase 2A.4 Blind Holdout has 24 isolated and schema-valid cases", () => {
  assert.equal(phase2a4BlindHoldoutCases.length, 24);
  assert.equal(new Set(phase2a4BlindHoldoutCases.map((item) => item.id)).size, 24);
  assert.equal(phase2a4RepeatedHighRiskCaseIds.length, 6);
  const prior = new Set([
    ...phase2aGoldDataset,
    ...phase2aSemanticSentinels,
    ...phase2a1SemanticSentinels,
    ...phase2a2DevelopmentVariants,
    ...phase2a2BlindHoldoutCases,
    ...phase2a3BlindHoldoutCases,
    ...phase2a4CriticalRegressions,
  ].map((item) => normalize(item.input)));

  for (const item of phase2a4BlindHoldoutCases) {
    assert.equal(prior.has(normalize(item.input)), false, item.id);
    assert.equal(item.holdout, true);
    assert.equal(item.exhaustive, true);
    assert.ok(item.attributeExpectations.every((value) => item.input.includes(value.evidenceText)), item.id);
    const protocol = getProtocol(item.pathway === "HEADACHE_V1" ? "headache" : "chest_pain");
    assert.doesNotThrow(() => validateExtractionEnvelope({
      schemaVersion: item.schemaVersion,
      pathway: item.pathway,
      facts: structuredClone(item.expectedFacts),
    }, protocol), item.id);
  }
});

test("Phase 2A.4 archived result preserves the pre-run production and Holdout seals", () => {
  const archived = JSON.parse(readFileSync(
    new URL("../evaluation/results/deepseek-v4-flash-phase-2a4.json", import.meta.url),
    "utf8",
  ));
  assert.deepEqual(archived.productionFreeze, phase2a4ProductionFreeze);
  assert.deepEqual(archived.holdoutSeal, phase2a4HoldoutSeal);
  assert.equal(
    hash(new URL("../evaluation/phase-2a4-blind-holdout.js", import.meta.url)),
    phase2a4HoldoutSeal.datasetSha256,
  );
  assert.equal(phase2a4ProductionFreeze.commit, "2f5aeb3fefb4a49e729a15a6099ff78ac3790e08");
  assert.equal(phase2a4HoldoutSeal.firstRealRun, true);
});

test("Phase 2A.4 leaves Gate and adjacent safety adjudicators unchanged", () => {
  for (const path of [
    "src/semantic/semantic-gate.js",
    "src/semantic/safety-signal-detector.js",
    "src/semantic/clarification-manager.js",
    "src/semantic/conversation-reconciler.js",
    "src/semantic/hybrid-semantic-validator.js",
    "src/semantic/targeted-verifier.js",
  ]) {
    assert.equal(phase2a4ProductionFreeze.files[path], phase2a3ProductionFreeze.files[path], path);
  }
});

function normalize(input) {
  return input.replace(/\s+/g, "").replace(/[，。？！、“”‘’—-]/g, "").toLowerCase();
}

function hash(file) {
  const normalized = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}
