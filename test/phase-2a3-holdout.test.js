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
import { phase2a3HoldoutSeal, phase2a3ProductionFreeze } from "../evaluation/phase-2a3-freeze-manifest.js";

const categories = ["colloquial", "typo", "negation", "uncertainty", "temporality", "quoted", "hypothetical", "correction", "conflict", "mixed_implicit"];

test("Phase 2A.3 Blind Holdout has 40 isolated cases across ten categories", () => {
  assert.equal(phase2a3BlindHoldoutCases.length, 40);
  assert.equal(new Set(phase2a3BlindHoldoutCases.map((item) => item.id)).size, 40);
  for (const category of categories) {
    assert.equal(phase2a3BlindHoldoutCases.filter((item) => item.category === category).length, 4);
  }
  const prior = new Set([
    ...phase2aGoldDataset,
    ...phase2aSemanticSentinels,
    ...phase2a1SemanticSentinels,
    ...phase2a2DevelopmentVariants,
    ...phase2a2BlindHoldoutCases,
  ].map((item) => normalize(item.input)));
  assert.ok(phase2a3BlindHoldoutCases.every((item) => !prior.has(normalize(item.input))));
});

test("Phase 2A.3 Holdout annotations are exact, schema-valid and measurable", () => {
  for (const item of phase2a3BlindHoldoutCases) {
    const protocol = getProtocol(item.pathway === "HEADACHE_V1" ? "headache" : "chest_pain");
    assert.doesNotThrow(() => validateExtractionEnvelope({
      schemaVersion: item.schemaVersion,
      pathway: item.pathway,
      facts: structuredClone(item.expectedFacts),
    }, protocol), item.id);
    assert.ok(
      item.attributeExpectations.every((value) => item.input.includes(value.evidenceText)),
      item.id,
    );
    assert.ok(
      item.expectedMappings.every((value) => protocol.semanticFactSchema[value.path]),
      item.id,
    );
  }
});

test("archived Phase 2A.3 production pipeline and Holdout match the pre-run freeze seal", () => {
  const archived = JSON.parse(readFileSync(
    new URL("../evaluation/results/deepseek-v4-flash-phase-2a3.json", import.meta.url),
    "utf8",
  ));
  for (const [path, expected] of Object.entries(phase2a3ProductionFreeze.files)) {
    assert.equal(archived.productionFreeze.files[path], expected, path);
  }
  assert.equal(
    hash(new URL("../evaluation/phase-2a3-blind-holdout.js", import.meta.url)),
    phase2a3HoldoutSeal.datasetSha256,
  );
  assert.equal(
    phase2a3ProductionFreeze.commit,
    "768073578cc999dd61449c864444121831d58049",
  );
  assert.equal(phase2a3HoldoutSeal.firstRealRun, true);
});

function normalize(input) {
  return input.replace(/\s+/g, "").replace(/[，。？！、“”‘’—-]/g, "").toLowerCase();
}

function hash(file) {
  const normalized = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}
