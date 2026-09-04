import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  PHASE_53_STABILITY_EVALUATOR_VERSION,
  evaluatePhase53Stability,
} from "../src/index.js";

const resultPromise = evaluatePhase53Stability();

test("Phase 5.3 duplicate benchmark covers five complaints without hiding unsupported boundaries", async () => {
  const result = await resultPromise;
  const benchmark = result.duplicateQuestionBenchmark;
  assert.equal(benchmark.totalCases, 39);
  assert.deepEqual(benchmark.coverage, [
    "headache",
    "chest_pain",
    "fever",
    "cough",
    "abdominal_pain",
  ]);
  assert.deepEqual(benchmark.activePlannerPathways, ["headache", "chest_pain"]);
  assert.equal(benchmark.unsupportedBoundaryConsistency.passed, 9);
  assert.equal(benchmark.unsupportedBoundaryConsistency.total, 9);
});

test("LangGraph removes answered-field repeats without introducing question drift", async () => {
  const benchmark = (await resultPromise).duplicateQuestionBenchmark;
  assert.equal(benchmark.legacy.count, 20);
  assert.equal(benchmark.legacy.duplicateQuestionRate, 1);
  assert.equal(benchmark.langgraph.count, 0);
  assert.equal(benchmark.langgraph.duplicateQuestionRate, 0);
  assert.equal(benchmark.intentionalDuplicateCorrections, 20);
  assert.equal(benchmark.questionDrift.count, 0);
  assert.equal(benchmark.questionDrift.rate, 0);
});

test("session resume preserves all five required memory fields and advances questions", async () => {
  const resume = (await resultPromise).sessionResumeStability;
  assert.equal(resume.passed, 2);
  assert.equal(resume.total, 2);
  assert.deepEqual(resume.fieldPasses, {
    sessionId: 2,
    caseState: 2,
    factMemory: 2,
    pendingQuestion: 2,
    questionLedger: 2,
  });
});

test("Legacy and LangGraph keep all required risk and disposition outcomes identical", async () => {
  const safety = (await resultPromise).safetyRegression;
  assert.equal(safety.total, 3);
  assert.equal(safety.riskDrift, 0);
  assert.equal(safety.dispositionDrift, 0);
  assert.equal(safety.cases.every((item) => item.expectedMatched), true);
  assert.deepEqual(safety.cases.map((item) => item.langgraphDisposition), [
    "EMERGENCY_NOW",
    "URGENT_SAME_DAY",
    "SELF_MONITOR",
  ]);
});

test("graph, checkpoint and planner failures all fall back to Legacy clinical output", async () => {
  const fallback = (await resultPromise).failureFallback;
  assert.equal(fallback.passed, 3);
  assert.equal(fallback.total, 3);
  assert.deepEqual(fallback.cases.map((item) => item.fallbackReason), [
    "LANGGRAPH_EXECUTION_FAILED",
    "PLANNER_CHECKPOINT_FAILED",
    "QUESTION_PLANNER_FAILED",
  ]);
  assert.equal(fallback.cases.every((item) =>
    item.riskLevel === "EMERGENCY_NOW" && item.disposition === "EMERGENCY_NOW"), true);
});

test("Fact Memory skips known facts while unknown and conflicting facts remain clarifiable", async () => {
  const consistency = (await resultPromise).factMemoryConsistency;
  assert.equal(consistency.passed, 6);
  assert.equal(consistency.total, 6);
  for (const item of consistency.cases) assert.equal(item.passed, true, item.id);
});

test("Phase 5.3 records a conditional pass and does not recommend changing the default yet", async () => {
  const result = await resultPromise;
  assert.equal(result.evaluatorVersion, PHASE_53_STABILITY_EVALUATOR_VERSION);
  assert.equal(result.validationVerdict, "PASS_WITH_CONDITIONS");
  assert.equal(result.defaultRecommendation, "KEEP_LEGACY_DEFAULT");

  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const report = await readFile(
    new URL("../docs/phase-5.3-langgraph-stability-validation.md", import.meta.url),
    "utf8",
  );
  const recordedResult = JSON.parse(await readFile(
    new URL(
      "../evaluation/results/phase-5.3-langgraph-stability.json",
      import.meta.url,
    ),
    "utf8",
  ));
  assert.match(envExample, /^AGENT_ORCHESTRATOR=legacy$/m);
  assert.deepEqual(recordedResult, result);
  for (const marker of [
    "PASS_WITH_CONDITIONS",
    "KEEP_LEGACY_DEFAULT",
    "Duplicate Question Rate",
    "Question Drift",
    "Risk Drift",
    "Disposition Drift",
    "Safety Core",
  ]) assert.match(report, new RegExp(marker));
});
