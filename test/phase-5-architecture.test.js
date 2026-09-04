import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { phase3ProtectedArchitectureFreeze } from "../evaluation/phase-3-core-freeze-manifest.js";

const SAFETY_CORE_PREFIXES = [
  "src/engine/",
  "src/domain/",
  "src/semantic/semantic-gate.js",
  "src/semantic/safety-signal-detector.js",
  "src/protocols/",
  "src/audit/",
  "src/safety/",
];

test("Phase 5 leaves the validated Safety Core, Gate and Pathways byte-for-byte unchanged", async () => {
  const protectedFiles = Object.entries(phase3ProtectedArchitectureFreeze.files)
    .filter(([file]) => SAFETY_CORE_PREFIXES.some((prefix) => file.startsWith(prefix)));
  assert.ok(protectedFiles.length >= 10);
  for (const [file, expectedHash] of protectedFiles) {
    const content = await readFile(new URL(`../${file}`, import.meta.url));
    const actualHash = createHash("sha256").update(content).digest("hex");
    assert.equal(actualHash, expectedHash, `${file} changed during Phase 5`);
  }
});

test("Phase 5 is an outer memory layer and adds no Clinical Pathway", async () => {
  const factory = await readFile(
    new URL("../src/phase5/create-phase5-agent.js", import.meta.url),
    "utf8",
  );
  assert.match(factory, /createPhase3Agent/);
  assert.doesNotMatch(factory, /SafetyCore|SemanticGate|PolicyEngine/);

  const protocols = (await readdir(new URL("../src/protocols", import.meta.url)))
    .filter((file) => file.endsWith(".js") && !["index.js", "extraction-helpers.js"].includes(file));
  assert.deepEqual(protocols.sort(), ["chest-pain.js", "headache.js"]);
});

test("Phase 5 documents persistence, fact filtering, recovery and privacy boundaries", async () => {
  const document = await readFile(
    new URL("../docs/phase-5-memory-layer.md", import.meta.url),
    "utf8",
  );
  for (const required of [
    "Session Manager",
    "Fact Memory",
    "Question Planner",
    "CaseState",
    "会话恢复",
    "重复追问",
    "SESSION_RESTORE_DRIFT",
    "医疗隐私",
    "Safety Core",
  ]) {
    assert.match(document, new RegExp(required));
  }
});
