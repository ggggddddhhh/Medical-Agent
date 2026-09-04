import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { protocols } from "../src/protocols/index.js";
import { phase2bProtectedCoreFreeze } from "../evaluation/phase-2b-core-freeze-manifest.js";

test("Phase 2B keeps the validated Node core byte-for-byte unchanged", () => {
  assert.equal(phase2bProtectedCoreFreeze.baselineCommit, "3d577a6ebe2eb1a141f67e5930ba601f80a7fe6d");
  for (const [path, expected] of Object.entries(phase2bProtectedCoreFreeze.files)) {
    assert.equal(hash(new URL("../" + path, import.meta.url)), expected, path);
  }
});

test("Phase 2B owns no pathway or LangGraph runtime integration", () => {
  assert.equal(Object.keys(protocols).length, 2);
  const source = [
    "create-phase2b-agent.js",
    "multi-turn-agent-loop.js",
    "core-session-bridge.js",
  ].map((file) => readFileSync(
    new URL(`../src/phase2b/${file}`, import.meta.url),
    "utf8",
  )).join("\n");
  assert.doesNotMatch(source, /@langchain|StateGraph|MemorySaver/);
});

test("Phase 2B document defines architecture, boundaries, APIs and real clarification flow", () => {
  const document = readFileSync(
    new URL("../docs/phase-2b-multi-turn-agent-loop.md", import.meta.url),
    "utf8",
  );
  for (const expected of [
    "MultiTurnAgentLoop",
    "Node.js 与 Python 服务边界",
    "/v1/sessions/{sessionId}/messages",
    "/v1/model/responses",
    "ACCEPT / UNCERTAIN / REJECT",
    "同一个 CaseState",
    "Phase 1 Safety Invariants",
    "246/246 tests passed",
    "4/4 tests passed",
    "没有加入 RAG",
  ]) assert.match(document, new RegExp(expected));
});

function hash(file) {
  const normalized = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}
