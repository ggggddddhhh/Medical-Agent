import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { phase3ProtectedArchitectureFreeze } from "../evaluation/phase-3-core-freeze-manifest.js";

test("Phase 4 keeps the validated Safety Core, Gate, loop and Response Layer unchanged", async () => {
  for (const [file, expectedHash] of Object.entries(phase3ProtectedArchitectureFreeze.files)) {
    const content = await readFile(new URL(`../${file}`, import.meta.url));
    const actualHash = createHash("sha256").update(content).digest("hex");
    assert.equal(actualHash, expectedHash, `${file} changed during Phase 4`);
  }
});

test("Phase 4 adds only a Demo layer and no Clinical Pathway", async () => {
  const protocols = (await readdir(new URL("../src/protocols", import.meta.url)))
    .filter((file) => file.endsWith(".js") && !["index.js", "extraction-helpers.js"].includes(file));
  assert.deepEqual(protocols.sort(), ["chest-pain.js", "headache.js"]);

  const factory = await readFile(
    new URL("../src/phase4/create-phase4-demo.js", import.meta.url),
    "utf8",
  );
  assert.match(factory, /createPhase5Agent/);
  assert.doesNotMatch(factory, /SafetyCore|SemanticGate|PolicyEngine|LightRAG/);

  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ));
  assert.equal(
    packageJson.scripts["start:demo"],
    "node --env-file-if-exists=.env scripts/run-phase4-demo-api.js",
  );
});

test("Phase 4 document records architecture, API, cases and safety validation", async () => {
  const report = await readFile(
    new URL("../docs/phase-4-demo.md", import.meta.url),
    "utf8",
  );
  for (const required of [
    "普通头痛",
    "模糊胸痛",
    "高风险胸痛",
    "/v1/demo/cases",
    "/v1/demo/sessions",
    "CaseState",
    "Safety Core",
    "RAG",
    "安全降级",
  ]) {
    assert.match(report, new RegExp(required));
  }
});
