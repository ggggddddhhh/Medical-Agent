import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { phase3ProtectedArchitectureFreeze } from "../evaluation/phase-3-core-freeze-manifest.js";

test("Phase 3 keeps the validated Core, agent loop and Response Layer unchanged", async () => {
  for (const [file, expectedHash] of Object.entries(phase3ProtectedArchitectureFreeze.files)) {
    const content = await readFile(new URL(`../${file}`, import.meta.url));
    const actualHash = createHash("sha256").update(content).digest("hex");
    assert.equal(actualHash, expectedHash, `${file} changed after the Phase 3 freeze`);
  }
});

test("Phase 3 pins LightRAG and BAAI/bge-m3 without adding a Clinical Pathway", async () => {
  const requirements = await readFile(
    new URL("../python_knowledge_service/requirements.txt", import.meta.url),
    "utf8",
  );
  assert.match(requirements, /^lightrag-hku==1\.5\.7$/m);

  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /^LIGHTRAG_EMBEDDING_MODEL=BAAI\/bge-m3$/m);
  assert.match(envExample, /^LIGHTRAG_EMBEDDING_DIM=1024$/m);
  assert.match(envExample, /^LIGHTRAG_EMBEDDING_MAX_TOKENS=8192$/m);

  const knowledgeStartup = await readFile(
    new URL("../scripts/run-python-knowledge-service.js", import.meta.url),
    "utf8",
  );
  assert.match(knowledgeStartup, /\.venv/);
  assert.match(knowledgeStartup, /PYTHON_KNOWLEDGE_EXECUTABLE/);

  const protocols = (await readdir(new URL("../src/protocols", import.meta.url)))
    .filter((file) => file.endsWith(".js") && !["index.js", "extraction-helpers.js"].includes(file));
  assert.deepEqual(protocols.sort(), ["chest-pain.js", "headache.js"]);
});

test("Phase 3 document records API, knowledge sources and safety boundary", async () => {
  const report = await readFile(
    new URL("../docs/phase-3-lightrag-knowledge-service.md", import.meta.url),
    "utf8",
  );
  for (const required of [
    "BAAI/bge-m3",
    "1024",
    "8192",
    "/v1/knowledge/query",
    "only_need_context",
    "CaseState",
    "Risk Decision",
    "no_results",
    "NHS",
    "CDC",
    "Phase 1 Safety Invariants",
  ]) {
    assert.match(report, new RegExp(required));
  }
});
