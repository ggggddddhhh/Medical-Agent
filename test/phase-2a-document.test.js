import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const design = readFileSync(
  new URL("../docs/phase-2a-semantic-extraction-design.md", import.meta.url),
  "utf8",
);
const report = readFileSync(
  new URL("../docs/phase-2a-evaluation-report.md", import.meta.url),
  "utf8",
);

test("Phase 2A documents record architecture, metrics, limitations, and promotion decision", () => {
  for (const text of [
    "Semantic Extraction Architecture",
    "clinical-facts-1.0.0",
    "允许与禁止输出",
    "Gold Dataset 包含 24 条",
    "Semantic Sentinel Set 包含 8 条",
  ]) {
    assert.ok(design.includes(text), text);
  }
  for (const text of [
    "PASS_WITH_CONDITIONS",
    "DeepSeek V4 Flash 正式双轮评测",
    "最终测试：102",
    "Phase 1 Safety Invariants：10/10",
    "是否具备进入 Phase 2B 的条件：**否**",
  ]) {
    assert.ok(report.includes(text), text);
  }
});
