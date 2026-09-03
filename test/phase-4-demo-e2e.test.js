import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  APPROVED_KNOWLEDGE_SOURCES,
  Disposition,
  KNOWLEDGE_CORPUS_VERSION,
  createDemoApiServer,
  createPhase4Demo,
  listDemoCases,
} from "../src/index.js";

const offlineModelFetch = async () => {
  throw new Error("Model service intentionally unavailable in deterministic Demo test.");
};

test("Phase 4 exposes exactly three fixed cases over the existing pathways", () => {
  const cases = listDemoCases();
  assert.deepEqual(cases.map((item) => item.title), [
    "普通头痛",
    "模糊胸痛",
    "高风险胸痛",
  ]);
  assert.deepEqual(
    new Set(cases.map((item) => item.expected.disposition)),
    new Set([
      Disposition.SELF_MONITOR,
      Disposition.URGENT_SAME_DAY,
      Disposition.EMERGENCY_NOW,
    ]),
  );
});

test("Demo session boundary rejects unknown or ambiguous context fields", () => {
  const demo = demoWith(new ApprovedKnowledgeClient());
  assert.throws(
    () => demo.startSession({ context: { adultConfirmed: true }, extra: true }),
    (error) => error.code === "INVALID_SESSION_REQUEST",
  );
  assert.throws(
    () => demo.startSession({
      caseId: "ordinary-headache",
      context: { adultConfirmed: true },
    }),
    (error) => error.code === "AMBIGUOUS_SESSION_CONTEXT",
  );
  assert.throws(
    () => demo.startSession({ context: { diagnosis: "forbidden" } }),
    (error) => error.code === "INVALID_CONTEXT",
  );
});

test("all fixed Demo cases complete the real multi-turn, Response and RAG policy flow", async () => {
  const knowledge = new ApprovedKnowledgeClient();
  const demo = demoWith(knowledge);

  const headache = await demo.runCase("ordinary-headache");
  assert.equal(headache.turns.length, 7);
  assert.equal(headache.turns[0].response.action, AgentAction.ASK_MORE);
  assert.equal(headache.finalResponse.disposition, Disposition.SELF_MONITOR);
  assert.equal(headache.finalResponse.knowledgeSupport.status, "available");
  assert.equal(headache.verification.passed, true);

  const ambiguousChest = await demo.runCase("ambiguous-chest-pain");
  assert.equal(ambiguousChest.turns.length, 6);
  assert.equal(ambiguousChest.turns[0].response.action, AgentAction.ASK_MORE);
  assert.equal(ambiguousChest.finalResponse.disposition, Disposition.URGENT_SAME_DAY);
  assert.equal(ambiguousChest.finalResponse.knowledgeSupport.status, "available");
  assert.equal(ambiguousChest.verification.passed, true);

  const emergency = await demo.runCase("high-risk-chest-pain");
  assert.equal(emergency.turns.length, 1);
  assert.equal(emergency.finalResponse.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(emergency.finalResponse.disposition, Disposition.EMERGENCY_NOW);
  assert.equal(emergency.finalResponse.knowledgeSupport.status, "not_requested");
  assert.equal(emergency.verification.passed, true);
  assert.equal(knowledge.calls.length, 2);

  for (const result of [headache, ambiguousChest, emergency]) {
    assertSafeResponse(result.finalResponse);
  }
});

test("RAG failure changes only knowledge support and leaves risk and CaseState unchanged", async () => {
  const available = demoWith(new ApprovedKnowledgeClient());
  const unavailable = demoWith({
    async query() {
      throw new Error("knowledge service offline");
    },
  });

  const supportedRun = await available.runCase("ordinary-headache");
  const degradedRun = await unavailable.runCase("ordinary-headache");
  const supportedState = available.getSession(supportedRun.sessionId).state;
  const degradedState = unavailable.getSession(degradedRun.sessionId).state;

  assert.equal(supportedRun.finalResponse.knowledgeSupport.status, "available");
  assert.equal(degradedRun.finalResponse.knowledgeSupport.status, "unavailable");
  assert.deepEqual(clinicalDecision(supportedRun.finalResponse), clinicalDecision(
    degradedRun.finalResponse,
  ));
  assert.deepEqual(normalizedState(supportedState), normalizedState(degradedState));
});

test("Demo HTTP API supports discovery, interactive turns and one-click case replay", async () => {
  const demo = demoWith(new ApprovedKnowledgeClient());
  const server = createDemoApiServer({ demo });
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const catalog = await jsonFetch(`${baseUrl}/v1/demo/cases`);
    assert.equal(catalog.cases.length, 3);

    const session = await jsonFetch(`${baseUrl}/v1/demo/sessions`, {
      method: "POST",
      body: JSON.stringify({ context: { adultConfirmed: true } }),
    });
    const firstTurn = await jsonFetch(
      `${baseUrl}/v1/demo/sessions/${session.sessionId}/messages`,
      { method: "POST", body: JSON.stringify({ message: "我头痛" }) },
    );
    assert.equal(firstTurn.action, AgentAction.ASK_MORE);
    assert.equal(firstTurn.followUpQuestions.length, 1);

    const state = await jsonFetch(
      `${baseUrl}/v1/demo/sessions/${session.sessionId}`,
    );
    assert.equal(state.state.turnCount, 1);
    assert.equal(state.state.sessionId, session.sessionId);

    const replay = await jsonFetch(
      `${baseUrl}/v1/demo/cases/high-risk-chest-pain/run`,
      { method: "POST" },
    );
    assert.equal(replay.verification.passed, true);
    assert.equal(replay.finalResponse.disposition, Disposition.EMERGENCY_NOW);
  } finally {
    await close(server);
  }
});

class ApprovedKnowledgeClient {
  calls = [];

  async query(request) {
    this.calls.push(structuredClone(request));
    const sourceId = request.topic === "headache"
      ? "NHS_HEADACHE_2024"
      : "MEDLINEPLUS_CHEST_PAIN_2025";
    const source = APPROVED_KNOWLEDGE_SOURCES[sourceId];
    return {
      serviceVersion: "phase-4-test-knowledge",
      status: "available",
      corpusVersion: KNOWLEDGE_CORPUS_VERSION,
      items: [{
        sourceId,
        title: source.title,
        url: source.url,
        reviewedAt: source.reviewedAt,
        snippet: source.snippet,
      }],
    };
  }
}

function demoWith(knowledgeClient) {
  return createPhase4Demo({
    knowledgeClient,
    fetchImpl: offlineModelFetch,
    extractionTimeoutMs: 20,
    verifierTimeoutMs: 20,
  });
}

function assertSafeResponse(response) {
  for (const key of [
    "riskLevel",
    "summary",
    "reasoning",
    "recommendedAction",
    "warningSigns",
    "followUpQuestions",
  ]) {
    assert.ok(Object.hasOwn(response, key), `missing Response field: ${key}`);
  }
  assert.doesNotMatch(JSON.stringify(response), /你患有|已经确诊|服用\s*\d+/);
}

function clinicalDecision(response) {
  return {
    action: response.action,
    disposition: response.disposition,
    riskLevel: response.riskLevel,
    reasonCodes: response.reasonCodes,
    summary: response.summary,
    reasoning: response.reasoning,
    recommendedAction: response.recommendedAction,
    warningSigns: response.warningSigns,
    followUpQuestions: response.followUpQuestions,
  };
}

function normalizedState(state) {
  const copy = structuredClone(state);
  delete copy.sessionId;
  return copy;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server) {
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
