import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { validateExtractionEnvelope } from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";
import { phase2aGoldDataset, phase2aSemanticSentinels } from "../evaluation/phase-2a-gold-dataset.js";
import { phase2a2DevelopmentVariants } from "../evaluation/phase-2a2-development-variants.js";
import { phase2a2BlindHoldoutCases } from "../evaluation/phase-2a2-blind-holdout.js";
import { phase2a2HoldoutSeal, phase2a2ProductionFreeze } from "../evaluation/phase-2a2-freeze-manifest.js";

const categories = ["colloquial", "typo", "negation", "uncertainty", "temporality", "quoted", "hypothetical", "correction", "conflict", "mixed_implicit"];

test("Phase 2A.2 has 60 development variants and 40 sealed Blind Holdout cases", () => {
  assert.equal(phase2a2DevelopmentVariants.length, 60);
  assert.equal(phase2a2BlindHoldoutCases.length, 40);
  for (const category of categories) {
    assert.equal(phase2a2DevelopmentVariants.filter((item) => item.category === category).length, 6, category);
    assert.equal(phase2a2BlindHoldoutCases.filter((item) => item.category === category).length, 4, category);
  }
  assert.ok(phase2a2BlindHoldoutCases.every((item) => item.holdout && item.exhaustive));
  assert.equal(new Set([...phase2a2DevelopmentVariants, ...phase2a2BlindHoldoutCases].map((item) => item.id)).size, 100);
});

test("development, holdout and historical inputs have no exact overlap", () => {
  const historical = new Set([...phase2aGoldDataset, ...phase2aSemanticSentinels].map((item) => normalize(item.input)));
  const development = new Set(phase2a2DevelopmentVariants.map((item) => normalize(item.input)));
  const holdout = new Set(phase2a2BlindHoldoutCases.map((item) => normalize(item.input)));
  assert.equal(development.size, 60);
  assert.equal(holdout.size, 40);
  assert.ok([...development].every((input) => !historical.has(input)));
  assert.ok([...holdout].every((input) => !historical.has(input) && !development.has(input)));
});

test("all Phase 2A.2 expected facts remain inside the existing Clinical Fact Schema", () => {
  for (const item of [...phase2a2DevelopmentVariants, ...phase2a2BlindHoldoutCases]) {
    const protocol = getProtocol(item.pathway === "HEADACHE_V1" ? "headache" : "chest_pain");
    assert.doesNotThrow(() => validateExtractionEnvelope({
      schemaVersion: item.schemaVersion,
      pathway: item.pathway,
      facts: structuredClone(item.expectedFacts),
    }, protocol), item.id);
  }
});

test("production semantic files and Blind Holdout match the pre-run freeze manifest", () => {
  const archived = JSON.parse(readFileSync(
    new URL("../evaluation/results/deepseek-v4-flash-phase-2a2.json", import.meta.url),
    "utf8",
  ));
  for (const [path, expected] of Object.entries(phase2a2ProductionFreeze.files)) {
    assert.equal(archived.productionFreeze.files[path], expected, path);
  }
  assert.equal(hash(new URL("../evaluation/phase-2a2-blind-holdout.js", import.meta.url)), phase2a2HoldoutSeal.datasetSha256);
  assert.equal(phase2a2HoldoutSeal.firstRealRun, true);
  assert.equal(phase2a2ProductionFreeze.commit, "b25c8b1f1214b23e49fd0f64343ce950963a7b78");
});

function normalize(input) {
  return input.replace(/\s+/g, "").replace(/[，。？！、“”‘’—-]/g, "").toLowerCase();
}

function hash(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
