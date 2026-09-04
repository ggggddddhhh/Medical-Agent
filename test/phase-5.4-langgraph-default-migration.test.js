import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { phase3ProtectedArchitectureFreeze } from
  "../evaluation/phase-3-core-freeze-manifest.js";
import {
  DEFAULT_AGENT_ORCHESTRATOR_MODE,
  FileSessionManager,
  createPhase5Agent,
  resolveAgentOrchestratorMode,
} from "../src/index.js";

const offlineFetch = async () => {
  throw new Error("Phase 5.4 deterministic offline test");
};

const unavailableKnowledge = {
  async query() { throw new Error("Knowledge service intentionally unavailable"); },
};

const scenarios = [
  {
    id: "headache-self-monitor",
    context: { adultConfirmed: true },
    messages: ["我头痛", "是慢慢出现的", "没有", "没有", "没有", "没有", "大概 3 分"],
    questionIds: [
      "HEADACHE_ONSET",
      "HEADACHE_NEURO",
      "HEADACHE_FEVER_NECK",
      "HEADACHE_CONSCIOUSNESS",
      "HEADACHE_TRAUMA",
      "HEADACHE_SEVERITY",
    ],
    disposition: "SELF_MONITOR",
  },
  {
    id: "chest-pain-urgent",
    context: { adultConfirmed: true },
    messages: ["我胸痛", "没有", "不是压榨感", "没有", "没有", "现在已经没有了"],
    questionIds: [
      "CHEST_PAIN_BREATHING",
      "CHEST_PAIN_PRESSURE",
      "CHEST_PAIN_RADIATION",
      "CHEST_PAIN_COLLAPSE",
      "CHEST_PAIN_ACTIVE",
    ],
    disposition: "URGENT_SAME_DAY",
  },
  {
    id: "chest-pain-emergency",
    context: { adultConfirmed: true },
    messages: ["胸口像石头压着一样，喘不上来气"],
    questionIds: [],
    disposition: "EMERGENCY_NOW",
  },
];

test("default startup resolves to LangGraph while legacy remains selectable", async (t) => {
  assert.equal(DEFAULT_AGENT_ORCHESTRATOR_MODE, "langgraph");
  assert.equal(withoutConfiguredMode(() => resolveAgentOrchestratorMode()), "langgraph");
  assert.equal(resolveAgentOrchestratorMode("legacy"), "legacy");

  const defaultAgent = agent(t, "default-startup");
  const defaultId = defaultAgent.startSession({ adultConfirmed: true });
  const defaultResponse = await defaultAgent.handleMessage(defaultId, "我胸痛");
  assert.equal(defaultResponse.orchestrator.mode, "langgraph");
  assert.equal(defaultResponse.orchestrator.responseSource, "langgraph_planner");

  const legacyAgent = agent(t, "explicit-legacy", { orchestratorMode: "legacy" });
  const legacyId = legacyAgent.startSession({ adultConfirmed: true });
  const legacyResponse = await legacyAgent.handleMessage(legacyId, "我胸痛");
  assert.equal(legacyResponse.question.id, defaultResponse.question.id);
  assert.equal(legacyResponse.orchestrator, undefined);
});

test("default LangGraph preserves the complete Headache Pathway", async (t) => {
  const result = await compareScenario(t, scenarios[0]);
  assert.deepEqual(result.defaultQuestionIds, scenarios[0].questionIds);
  assert.equal(result.defaultFinal.disposition, "SELF_MONITOR");
  assert.equal(result.riskDrift, 0);
  assert.equal(result.dispositionDrift, 0);
});

test("default LangGraph preserves the complete Chest Pain Pathway", async (t) => {
  const result = await compareScenario(t, scenarios[1]);
  assert.deepEqual(result.defaultQuestionIds, scenarios[1].questionIds);
  assert.equal(result.defaultFinal.disposition, "URGENT_SAME_DAY");
  assert.equal(result.riskDrift, 0);
  assert.equal(result.dispositionDrift, 0);
});

test("default LangGraph has zero risk and disposition drift across all target levels", async (t) => {
  let riskDrift = 0;
  let dispositionDrift = 0;
  for (const scenario of scenarios) {
    const result = await compareScenario(t, scenario, "risk-matrix");
    riskDrift += result.riskDrift;
    dispositionDrift += result.dispositionDrift;
    assert.equal(result.defaultFinal.disposition, scenario.disposition);
  }
  assert.equal(riskDrift, 0);
  assert.equal(dispositionDrift, 0);
});

test("a default LangGraph failure automatically returns the Legacy clinical result", async (t) => {
  const failure = new Error("graph unavailable");
  failure.code = "LANGGRAPH_DEFAULT_UNAVAILABLE";
  const graph = {
    async invoke() { throw failure; },
    async getState() { return { values: {} }; },
  };
  const fallbackAgent = agent(t, "fallback", { plannerGraph: graph });
  const legacyAgent = agent(t, "fallback-legacy", { orchestratorMode: "legacy" });
  const fallbackId = fallbackAgent.startSession({ adultConfirmed: true });
  const legacyId = legacyAgent.startSession({ adultConfirmed: true });
  const message = "胸口像石头压着一样，喘不上来气";
  const actual = await fallbackAgent.handleMessage(fallbackId, message);
  const expected = await legacyAgent.handleMessage(legacyId, message);

  assert.deepEqual(clinicalProjection(actual), clinicalProjection(expected));
  assert.equal(actual.orchestrator.status, "fallback");
  assert.equal(actual.orchestrator.responseSource, "legacy");
  assert.equal(actual.orchestrator.fallbackReason, "LANGGRAPH_DEFAULT_UNAVAILABLE");
});

test("default LangGraph restores session, memory, pending question and ledger", async (t) => {
  const directory = temporaryDirectory(t, "resume");
  const firstManager = new FileSessionManager({ directory });
  const first = createDefaultAgent({ directory, sessionManager: firstManager });
  const sessionId = first.startSession({ adultConfirmed: true });
  const initial = await first.handleMessage(sessionId, "我胸痛");
  const before = firstManager.load(sessionId);
  assert.equal(initial.question.id, "CHEST_PAIN_BREATHING");

  const secondManager = new FileSessionManager({ directory });
  const second = createDefaultAgent({ directory, sessionManager: secondManager });
  const restored = await second.resumeSession(sessionId);
  const after = secondManager.load(sessionId);
  assert.equal(restored.orchestrator.mode, "langgraph");
  assert.equal(restored.state.sessionId, sessionId);
  assert.deepEqual(restored.state, before.caseState);
  assert.deepEqual(restored.pendingClarification, before.pendingClarification);
  assert.deepEqual(after.factMemory, before.factMemory);
  assert.deepEqual(after.questionMemory.questions, before.questionMemory.questions);

  const next = await second.handleMessage(sessionId, "没有");
  assert.equal(next.question.id, "CHEST_PAIN_PRESSURE");
});

test("Phase 5.4 changes no protected clinical, response or knowledge module", async () => {
  for (const [file, expectedHash] of Object.entries(
    phase3ProtectedArchitectureFreeze.files,
  )) {
    const content = await readFile(new URL(`../${file}`, import.meta.url));
    const actualHash = createHash("sha256").update(content).digest("hex");
    assert.equal(actualHash, expectedHash, `${file} changed during Phase 5.4`);
  }

  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const report = await readFile(
    new URL("../docs/phase-5.4-langgraph-default-migration.md", import.meta.url),
    "utf8",
  );
  const docsIndex = await readFile(new URL("../docs/README.md", import.meta.url), "utf8");
  assert.match(envExample, /^AGENT_ORCHESTRATOR=langgraph$/m);
  assert.match(docsIndex, /phase-5\.4-langgraph-default-migration\.md/);
  for (const marker of [
    "LANGGRAPH_DEFAULT",
    "Legacy fallback",
    "Risk Drift",
    "Session Resume",
    "Safety Core",
    "LightRAG",
  ]) assert.match(report, new RegExp(marker));
});

async function compareScenario(t, scenario, prefix = "pathway") {
  const defaultAgent = agent(t, `${prefix}-${scenario.id}-default`);
  const legacyAgent = agent(t, `${prefix}-${scenario.id}-legacy`, {
    orchestratorMode: "legacy",
  });
  const defaultRun = await runConversation(defaultAgent, scenario);
  const legacyRun = await runConversation(legacyAgent, scenario);
  return {
    defaultFinal: defaultRun.final,
    legacyFinal: legacyRun.final,
    defaultQuestionIds: defaultRun.questionIds,
    riskDrift: Number(defaultRun.final.riskLevel !== legacyRun.final.riskLevel),
    dispositionDrift: Number(
      defaultRun.final.disposition !== legacyRun.final.disposition,
    ),
  };
}

async function runConversation(runner, scenario) {
  const sessionId = runner.startSession(scenario.context);
  const responses = [];
  for (const message of scenario.messages) {
    responses.push(await runner.handleMessage(sessionId, message));
  }
  return {
    final: responses.at(-1),
    questionIds: responses.flatMap((response) =>
      response.question?.id ? [response.question.id] : []),
  };
}

function agent(t, suffix, overrides = {}) {
  const directory = temporaryDirectory(t, suffix);
  if (Object.hasOwn(overrides, "orchestratorMode")) {
    return createDefaultAgent({ directory, ...overrides });
  }
  return withoutConfiguredMode(() => createDefaultAgent({ directory, ...overrides }));
}

function createDefaultAgent(options) {
  return createPhase5Agent({
    fetchImpl: offlineFetch,
    extractionTimeoutMs: 20,
    verifierTimeoutMs: 20,
    knowledgeClient: unavailableKnowledge,
    ...options,
  });
}

function temporaryDirectory(t, suffix) {
  const directory = mkdtempSync(join(tmpdir(), `medical-agent-phase54-${suffix}-`));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function withoutConfiguredMode(callback) {
  const existed = Object.hasOwn(process.env, "AGENT_ORCHESTRATOR");
  const previous = process.env.AGENT_ORCHESTRATOR;
  delete process.env.AGENT_ORCHESTRATOR;
  try {
    return callback();
  } finally {
    if (existed) process.env.AGENT_ORCHESTRATOR = previous;
  }
}

function clinicalProjection(response) {
  return {
    action: response.action,
    disposition: response.disposition,
    riskLevel: response.riskLevel,
    reasonCodes: response.reasonCodes,
    question: response.question ?? null,
  };
}
