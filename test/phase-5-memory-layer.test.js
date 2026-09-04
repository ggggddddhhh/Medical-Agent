import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AgentAction,
  FactMemory,
  FileSessionManager,
  MemoryLayerAgent,
  QuestionPlanner,
  createDemoApiServer,
  createPhase2CAgentLoop,
  createPhase4Demo,
} from "../src/index.js";

const offlineFetch = async () => {
  throw new Error("model service intentionally unavailable");
};

test("Phase 5 restores a pending session and advances without repeating an answered question", async (t) => {
  const directory = temporaryMemoryDirectory(t);
  const manager = new FileSessionManager({ directory });
  const firstProcess = memoryAgent(manager);
  const sessionId = firstProcess.startSession({ adultConfirmed: true });

  const first = await firstProcess.handleMessage(sessionId, "我胸痛");
  assert.equal(first.question.id, "CHEST_PAIN_BREATHING");
  assert.equal(first.memory.restorable, true);

  const stored = manager.load(sessionId);
  assert.equal(stored.history.length, 2);
  assert.equal(stored.snapshots.length, 2);
  assert.equal(stored.pendingClarification.factPath, "redFlags.difficultyBreathing");

  const secondProcess = memoryAgent(new FileSessionManager({ directory }));
  const restored = await secondProcess.resumeSession(sessionId);
  assert.equal(restored.state.sessionId, sessionId);
  assert.equal(restored.pendingClarification.question.id, "CHEST_PAIN_BREATHING");

  const second = await secondProcess.handleMessage(sessionId, "没有");
  assert.equal(second.question.id, "CHEST_PAIN_PRESSURE");
  assert.notEqual(second.question.id, first.question.id);
  assert.equal(second.memory.answeredFactPaths.includes(
    "redFlags.difficultyBreathing",
  ), true);
  assert.equal(second.memory.duplicateQuestionFiltered, false);
  assert.equal(secondProcess.getHistory(sessionId).length, 4);
});

test("a restored high-risk clarification answer still reaches the unchanged Safety Core", async (t) => {
  const directory = temporaryMemoryDirectory(t);
  const firstProcess = memoryAgent(new FileSessionManager({ directory }));
  const sessionId = firstProcess.startSession({ adultConfirmed: true });
  await firstProcess.handleMessage(sessionId, "我胸痛");

  const secondProcess = memoryAgent(new FileSessionManager({ directory }));
  const emergency = await secondProcess.handleMessage(sessionId, "有");

  assert.equal(emergency.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(emergency.disposition, "EMERGENCY_NOW");
  assert.equal(secondProcess.getSession(sessionId).state.redFlags.difficultyBreathing, true);
});

test("Fact Memory and Question Planner filter answered fields before planning", () => {
  const caseState = {
    closed: false,
    turnCount: 2,
    patientContext: { adultConfirmed: true },
    chiefComplaint: { code: "chest_pain" },
    factMetadata: {
      "patientContext.adultConfirmed": {
        status: "known",
        value: true,
        updatedAtTurn: 0,
      },
      "redFlags.difficultyBreathing": {
        status: "known",
        value: false,
        updatedAtTurn: 2,
      },
    },
  };
  const facts = new FactMemory().snapshot(caseState);
  const planned = new QuestionPlanner().plan({
    caseState,
    factMemory: facts,
    pendingClarification: {
      source: "core",
      factPath: "redFlags.difficultyBreathing",
      question: {
        id: "CHEST_PAIN_BREATHING",
        text: "胸痛时有没有呼吸困难？",
      },
    },
  });

  assert.equal(facts.confirmedFacts.some((item) =>
    item.path === "redFlags.difficultyBreathing" && item.value === false), true);
  assert.equal(planned.id, "CHEST_PAIN_PRESSURE");
});

test("memory persistence failure degrades memory only and cannot lower an emergency decision", async () => {
  const agent = memoryAgent({
    save() {
      const error = new Error("disk unavailable");
      error.code = "MEMORY_DISK_UNAVAILABLE";
      throw error;
    },
    load() {
      throw new Error("not used");
    },
  });
  const sessionId = agent.startSession({ adultConfirmed: true });
  const response = await agent.handleMessage(sessionId, "我胸痛而且喘不上来");

  assert.equal(response.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(response.disposition, "EMERGENCY_NOW");
  assert.equal(response.memory.persistenceStatus, "unavailable");
  assert.equal(response.memory.persistenceErrorCode, "MEMORY_DISK_UNAVAILABLE");
});

test("File Session Manager rejects path traversal session IDs", () => {
  const manager = new FileSessionManager({ directory: join(tmpdir(), "medical-agent-memory") });
  assert.throws(() => manager.load("../outside"), /unsupported characters/);
});

test("Demo API resumes a persisted session after a server restart", async (t) => {
  const directory = temporaryMemoryDirectory(t);
  const firstServer = createDemoApiServer({ demo: demoWithMemory(directory) });
  await listen(firstServer);
  const firstBase = `http://127.0.0.1:${firstServer.address().port}`;
  const created = await jsonFetch(`${firstBase}/v1/demo/sessions`, {
    method: "POST",
    body: JSON.stringify({ context: { adultConfirmed: true } }),
  });
  const first = await jsonFetch(
    `${firstBase}/v1/demo/sessions/${created.sessionId}/messages`,
    { method: "POST", body: JSON.stringify({ message: "我胸痛" }) },
  );
  assert.equal(first.question.id, "CHEST_PAIN_BREATHING");
  await close(firstServer);

  const secondServer = createDemoApiServer({ demo: demoWithMemory(directory) });
  await listen(secondServer);
  t.after(async () => close(secondServer));
  const secondBase = `http://127.0.0.1:${secondServer.address().port}`;
  const restored = await jsonFetch(
    `${secondBase}/v1/demo/sessions/${created.sessionId}/resume`,
    { method: "POST" },
  );
  assert.equal(restored.sessionId, created.sessionId);
  assert.equal(restored.memory.restorable, true);

  const next = await jsonFetch(
    `${secondBase}/v1/demo/sessions/${created.sessionId}/messages`,
    { method: "POST", body: JSON.stringify({ message: "没有" }) },
  );
  assert.equal(next.question.id, "CHEST_PAIN_PRESSURE");
  const history = await jsonFetch(
    `${secondBase}/v1/demo/sessions/${created.sessionId}/history`,
  );
  assert.equal(history.history.length, 4);
});

function memoryAgent(sessionManager) {
  return new MemoryLayerAgent({
    sessionManager,
    agentFactory: () => createPhase2CAgentLoop({
      fetchImpl: offlineFetch,
      extractionTimeoutMs: 20,
      verifierTimeoutMs: 20,
    }),
  });
}

function temporaryMemoryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "medical-agent-memory-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function demoWithMemory(memoryStorageDir) {
  return createPhase4Demo({
    memoryStorageDir,
    fetchImpl: offlineFetch,
    extractionTimeoutMs: 20,
    verifierTimeoutMs: 20,
    knowledgeClient: { async query() { throw new Error("not requested"); } },
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  assert.ok(response.ok, `HTTP ${response.status} for ${url}`);
  return response.json();
}
