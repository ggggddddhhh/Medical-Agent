import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { phase3ProtectedArchitectureFreeze } from "../evaluation/phase-3-core-freeze-manifest.js";

test("React Web Demo leaves the validated Node.js clinical authority byte-for-byte unchanged", async () => {
  for (const [file, expectedHash] of Object.entries(phase3ProtectedArchitectureFreeze.files)) {
    const content = await readFile(new URL(`../${file}`, import.meta.url));
    assert.equal(
      createHash("sha256").update(content).digest("hex"),
      expectedHash,
      `${file} changed after the Phase 3 freeze`,
    );
  }
});

test("React Web Demo is an API-only client for the published Phase 4 boundary", async () => {
  const app = await readFile(new URL("../web/src/App.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../web/src/api/demo-api.js", import.meta.url), "utf8");

  assert.match(app, /\.\/api\/demo-api\.js/);
  assert.doesNotMatch(app, /src\/(?:engine|domain|semantic|phase2b|phase2c|phase3)/);
  for (const route of [
    "/health",
    "/v1/demo/cases",
    "/v1/demo/sessions",
    "/messages",
    "/resume",
    "/history",
  ]) assert.match(api, new RegExp(route));

  const protocols = (await readdir(new URL("../src/protocols", import.meta.url)))
    .filter((file) => file.endsWith(".js") && !["index.js", "extraction-helpers.js"].includes(file));
  assert.deepEqual(protocols.sort(), ["chest-pain.js", "headache.js"]);
});

test("React Web Demo exposes the three competition cases, service degradation and RAG provenance", async () => {
  const app = await readFile(new URL("../web/src/App.jsx", import.meta.url), "utf8");
  const cases = await readFile(new URL("../src/phase4/demo-cases.js", import.meta.url), "utf8");
  for (const required of [
    "普通头痛",
    "模糊胸痛",
    "高风险胸痛",
  ]) assert.match(cases, new RegExp(required));
  for (const required of [
    "服务未连接",
    "knowledgeSupport",
    "sources",
    "followUpQuestions",
    "riskLevel",
    "CaseState",
    "Safety Core",
    "Semantic Gate",
    "RAG Knowledge",
    "getSession",
    "gateSummary",
    "已触发紧急安全升级",
    "SESSION HISTORY",
    "Current Session Memory",
    "Fact Memory",
    "Question Planner",
    "CaseState 变化记录",
    "resumeSession",
    "getHistory",
  ]) assert.match(app, new RegExp(required));
});
