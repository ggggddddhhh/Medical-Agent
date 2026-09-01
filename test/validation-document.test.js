import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const invariants = readFileSync(
  new URL("../docs/safety-invariants.md", import.meta.url),
  "utf8",
);
const report = readFileSync(
  new URL("../docs/phase-1-validation-report.md", import.meta.url),
  "utf8",
);

test("safety invariant document contains ten uniquely identified automated invariants", () => {
  const ids = [...invariants.matchAll(/\| (INV-\d{3}) \|/g)].map(
    (match) => match[1],
  );
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(ids, [
    "INV-001",
    "INV-002",
    "INV-003",
    "INV-004",
    "INV-005",
    "INV-006",
    "INV-007",
    "INV-008",
    "INV-009",
    "INV-010",
  ]);
  assert.match(invariants, /有自动化测试覆盖：\*\*10\*\*/);
});

test("validation report records limitations, issue counts, dry run, tests, and conditional readiness", () => {
  for (const requiredText of [
    "Validation Limitations",
    "不能证明",
    "ABDOMINAL_PAIN_V1",
    "剩余 P0",
    "剩余 **5** 项",
    "剩余 **3** 项",
    "新增测试：**47**",
    "最终测试：**68**",
    "PASS_WITH_CONDITIONS",
    "是否建议进入 LLM Integration：**是，有条件建议**",
  ]) {
    assert.ok(report.includes(requiredText), requiredText);
  }
});
