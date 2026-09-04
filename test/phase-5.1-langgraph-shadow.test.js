import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { phase3ProtectedArchitectureFreeze } from "../evaluation/phase-3-core-freeze-manifest.js";

const PROTECTED_PREFIXES = [
  "src/engine/",
  "src/domain/",
  "src/semantic/",
  "src/protocols/",
  "src/safety/",
];

test("Phase 5.1 Shadow leaves Safety Core, Semantic Gate and Pathways unchanged", async () => {
  const files = Object.entries(phase3ProtectedArchitectureFreeze.files)
    .filter(([path]) => PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix)));
  assert.ok(files.length >= 10);
  for (const [path, expectedHash] of files) {
    const content = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(createHash("sha256").update(content).digest("hex"), expectedHash, path);
  }
});

test("LangGraph dependencies stay isolated from the production package and Legacy factory", async () => {
  const rootPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const prototypePackage = JSON.parse(await readFile(
    new URL("../prototypes/phase5-orchestrator/package.json", import.meta.url),
    "utf8",
  ));
  const factory = await readFile(new URL("../src/phase5/create-phase5-agent.js", import.meta.url), "utf8");

  assert.equal(rootPackage.dependencies, undefined);
  assert.equal(rootPackage.devDependencies, undefined);
  assert.equal(prototypePackage.dependencies["@langchain/langgraph"], "1.4.13");
  assert.equal(prototypePackage.dependencies["@langchain/core"], "1.2.9");
  assert.match(factory, /MemoryLayerAgent/);
  assert.doesNotMatch(factory, /LangGraph|ShadowOrchestrator|phase5-orchestrator/);
});

test("Phase 5.1 source is explicitly Shadow-only and exposes required comparison states", async () => {
  const source = await readFile(
    new URL("../prototypes/phase5-orchestrator/src/shadow-orchestrator.js", import.meta.url),
    "utf8",
  );
  const graph = await readFile(
    new URL("../prototypes/phase5-orchestrator/src/shadow-graph.js", import.meta.url),
    "utf8",
  );
  for (const marker of [
    "responseSource: \"legacy\"",
    "return legacyResponse",
    "messageDigest",
    "SHADOW_MUTATED_LEGACY_CASE_STATE",
  ]) assert.match(source, new RegExp(marker));
  for (const marker of [
    "StateGraph",
    "MemorySaver",
    "reconcile_fact_memory",
    "plan_question",
    "compare_legacy",
    "LEGACY_DUPLICATE",
    "QUESTION_DRIFT",
  ]) assert.match(graph, new RegExp(marker));
});

test("Phase 5.1 document defines migration, state, nodes, tests and safety boundaries", async () => {
  const document = await readFile(
    new URL("../docs/phase-5.1-langgraph-shadow.md", import.meta.url),
    "utf8",
  );
  for (const marker of [
    "SHADOW_PROTOTYPE_ONLY",
    "State Schema",
    "Node 映射",
    "Legacy Agent",
    "LEGACY_DUPLICATE",
    "Safety Core",
    "Semantic Gate",
    "Phase 5.2",
    "测试方案",
  ]) assert.match(document, new RegExp(marker));
});
