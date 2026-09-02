import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { validateExtractionEnvelope } from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";
import { phase2aPromotionSubjectHoldout } from "../evaluation/phase-2a-promotion-subject-holdout.js";
import {
  phase2aPromotionHoldoutSeal,
  phase2aPromotionProductionFreeze,
  phase2aPromotionRepeatedCaseIds,
} from "../evaluation/phase-2a-promotion-freeze-manifest.js";
import { phase2a4BlindHoldoutCases } from "../evaluation/phase-2a4-blind-holdout.js";
import { phase2a4CriticalRegressions } from "../evaluation/phase-2a4-critical-regressions.js";

test("promotion Subject Blind Holdout contains 12 isolated schema-valid cases", () => {
  assert.equal(phase2aPromotionSubjectHoldout.length, 12);
  assert.equal(new Set(phase2aPromotionSubjectHoldout.map((item) => item.id)).size, 12);
  assert.equal(phase2aPromotionRepeatedCaseIds.length, 4);
  const prior = new Set([...phase2a4BlindHoldoutCases, ...phase2a4CriticalRegressions]
    .map((item) => normalize(item.input)));
  for (const item of phase2aPromotionSubjectHoldout) {
    assert.equal(prior.has(normalize(item.input)), false, item.id);
    assert.equal(item.holdout, true);
    assert.equal(item.exhaustive, true);
    assert.ok(item.expectedUncertainties.length > 0, item.id);
    assert.deepEqual(item.expectedClarifications, item.expectedUncertainties, item.id);
    assert.ok(item.attributeExpectations.every((value) => item.input.includes(value.evidenceText)), item.id);
    const protocol = getProtocol(item.pathway === "HEADACHE_V1" ? "headache" : "chest_pain");
    assert.doesNotThrow(() => validateExtractionEnvelope({
      schemaVersion: item.schemaVersion,
      pathway: item.pathway,
      facts: structuredClone(item.expectedFacts),
    }, protocol), item.id);
  }
});

test("promotion production freeze and Subject Blind Holdout match their pre-run seals", () => {
  for (const [path, expected] of Object.entries(phase2aPromotionProductionFreeze.files)) {
    assert.equal(hash(new URL("../" + path, import.meta.url)), expected, path);
  }
  assert.equal(
    hash(new URL("../evaluation/phase-2a-promotion-subject-holdout.js", import.meta.url)),
    phase2aPromotionHoldoutSeal.datasetSha256,
  );
  assert.equal(phase2aPromotionProductionFreeze.commit, "cb078fb71a3f675856e2a143180bb8c4ed3773e3");
  assert.equal(phase2aPromotionHoldoutSeal.firstRealRun, true);
});

function normalize(input) {
  return input.replace(/\s+/g, "").replace(/[，。？！、“”‘’—-]/g, "").toLowerCase();
}

function hash(file) {
  const normalized = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}
