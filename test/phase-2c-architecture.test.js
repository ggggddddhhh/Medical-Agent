import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { phase2cProtectedArchitectureFreeze } from "../evaluation/phase-2c-core-freeze-manifest.js";

test("Phase 2C keeps the validated Core and Phase 2B orchestration byte-for-byte unchanged", async () => {
  for (const [file, expectedHash] of Object.entries(phase2cProtectedArchitectureFreeze.files)) {
    const content = await readFile(new URL(`../${file}`, import.meta.url));
    const actualHash = createHash("sha256").update(content).digest("hex");
    assert.equal(actualHash, expectedHash, `${file} changed after the Phase 2C freeze`);
  }
});

test("Phase 2C owns no RAG runtime, model change, LangGraph integration or Clinical Pathway", async () => {
  const protocols = (await readdir(new URL("../src/protocols", import.meta.url)))
    .filter((file) => file.endsWith(".js") && !["index.js", "extraction-helpers.js"].includes(file));
  assert.deepEqual(protocols.sort(), ["chest-pain.js", "headache.js"]);

  const phase2cFiles = await readdir(new URL("../src/phase2c", import.meta.url));
  assert.equal(phase2cFiles.some((file) => /rag|embedding|retriever/i.test(file)), false);
  const phase2cSource = (await Promise.all(phase2cFiles
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFile(new URL(`../src/phase2c/${file}`, import.meta.url), "utf8"))))
    .join("\n");
  assert.doesNotMatch(phase2cSource, /@langchain|StateGraph|MemorySaver/);
  const startup = await readFile(
    new URL("../scripts/run-phase-2b-agent-api.js", import.meta.url),
    "utf8",
  );
  assert.match(startup, /createPhase2CAgentLoop/);
  assert.doesNotMatch(startup, /model\s*:/);
});

test("Phase 2C document records architecture, response contract and safety boundary", async () => {
  const report = await readFile(
    new URL("../docs/phase-2c-response-layer.md", import.meta.url),
    "utf8",
  );
  for (const required of [
    "ResponseGenerator",
    "ResponseSafetyGuard",
    "riskLevel",
    "recommendedAction",
    "warningSigns",
    "followUpQuestions",
    "CaseState",
    "Semantic Gate",
    "LightRAG",
    "enabled: false",
    "Phase 1 Safety Invariants",
  ]) {
    assert.match(report, new RegExp(required));
  }
});
