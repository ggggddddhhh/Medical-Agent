import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const report = readFileSync(
  new URL("../docs/phase-2a-real-model-evaluation.md", import.meta.url),
  "utf8",
);
const result = JSON.parse(
  readFileSync(
    new URL(
      "../evaluation/results/deepseek-v4-flash-phase-2a.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("real-model report matches the sanitized DeepSeek evaluation artifact", () => {
  for (const text of [
    "Provider: `DeepSeek`",
    "Model: `deepseek-v4-flash`",
    "96.875%",
    "Critical Semantic Miss",
    "Clinical validation pending",
    "**FAIL**",
    "**NOT_READY**",
    "Phase 1 Safety Invariants: `10 / 10 passed`",
  ]) {
    assert.ok(report.includes(text), text);
  }
  assert.equal(result.provider, "DeepSeek");
  assert.equal(result.model, "deepseek-v4-flash");
  assert.equal(result.goldExecutions, 48);
  assert.equal(result.sentinelExecutions, 16);
  assert.equal(result.criticalSemanticMisses.length, 10);
  assert.equal(result.hallucinationCount, 23);
  assert.equal(result.schemaFailureCount, 2);
  assert.equal(result.providerFailureCount, 0);
  assert.equal(result.passedSentinelCases, 0);
  assert.equal(result.runToRunDrift, true);
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.phase2B, "NOT_READY");

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "DEEPSEEK_API_KEY",
    "apiKey",
    "reasoning_content",
    "reasoning_text",
    "systemInstruction",
    '"input"',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
