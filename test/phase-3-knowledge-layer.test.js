import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import {
  AgentAction,
  APPROVED_KNOWLEDGE_SOURCES,
  Disposition,
  KNOWLEDGE_CORPUS_VERSION,
  KnowledgeEnrichedAgent,
  KnowledgeResponseGuard,
  KnowledgeResponseSafetyError,
  KnowledgeSupportPolicy,
  PythonKnowledgeServiceClient,
  createAgentApiServer,
} from "../src/index.js";

test("knowledge policy requests support only after a non-emergency final disposition", () => {
  const policy = new KnowledgeSupportPolicy();
  const state = fixedState("policy", "headache", Disposition.CLINIC_SOON);
  const request = policy.createRequest({
    decision: fixedDecision("policy", Disposition.CLINIC_SOON),
    caseState: state,
  });
  assert.deepEqual(request, { topic: "headache", intent: "health_education", limit: 2 });
  assert.equal(policy.createRequest({
    decision: { action: AgentAction.ASK_MORE, disposition: null },
    caseState: state,
  }), null);
  assert.equal(policy.createRequest({
    decision: fixedDecision("policy", Disposition.EMERGENCY_NOW, AgentAction.SAFETY_ESCALATION),
    caseState: fixedState("policy", "headache", Disposition.EMERGENCY_NOW),
  }), null);
});

test("Python knowledge client sends no CaseState, risk decision or patient text", async () => {
  let sent;
  const client = new PythonKnowledgeServiceClient({
    baseUrl: "http://knowledge.test",
    fetchImpl: async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => approvedPayload("NHS_HEADACHE_2024") };
    },
  });
  await client.query({ topic: "headache", intent: "health_education", limit: 2 });
  assert.equal(sent.url, "http://knowledge.test/v1/knowledge/query");
  assert.deepEqual(Object.keys(sent.body).sort(), ["intent", "limit", "topic"]);
  assert.doesNotMatch(JSON.stringify(sent.body), /CaseState|riskLevel|disposition|message/);
});

test("knowledge guard materializes approved content without changing the decision", () => {
  const decision = fixedDecision("guard", Disposition.CLINIC_SOON);
  const support = new KnowledgeResponseGuard().validate({
    payload: approvedPayload("NHS_HEADACHE_2024"),
    request: { topic: "headache", intent: "health_education", limit: 2 },
    decision,
  });
  assert.equal(support.status, "available");
  assert.equal(support.sources[0].url, APPROVED_KNOWLEDGE_SOURCES.NHS_HEADACHE_2024.url);
  assert.match(support.explanation, /不用于诊断.*不会改变/);
  assert.equal(decision.disposition, Disposition.CLINIC_SOON);
});

test("knowledge guard rejects decision fields and unapproved source content", () => {
  const decision = fixedDecision("guard-reject", Disposition.CLINIC_SOON);
  const request = { topic: "headache", intent: "health_education", limit: 2 };
  assert.throws(
    () => new KnowledgeResponseGuard().validate({
      payload: { ...approvedPayload("NHS_HEADACHE_2024"), riskLevel: "LOW" },
      request,
      decision,
    }),
    KnowledgeResponseSafetyError,
  );
  const tampered = approvedPayload("NHS_HEADACHE_2024");
  tampered.items[0].snippet = "系统编造的额外医学结论";
  assert.throws(
    () => new KnowledgeResponseGuard().validate({ payload: tampered, request, decision }),
    (error) =>
      error instanceof KnowledgeResponseSafetyError && error.code === "SOURCE_CONTENT_MISMATCH",
  );
});

test("no-results response contains no explanation, snippet or source", async () => {
  const agent = knowledgeAgent({
    query: async () => ({
      serviceVersion: "test",
      status: "no_results",
      corpusVersion: KNOWLEDGE_CORPUS_VERSION,
      items: [],
    }),
  });
  const response = await agent.handleMessage("knowledge-session", "继续");
  assert.deepEqual(response.knowledgeSupport, {
    status: "no_results",
    corpusVersion: KNOWLEDGE_CORPUS_VERSION,
    explanation: null,
    snippets: [],
    sources: [],
  });
});

test("knowledge service failure degrades to the unchanged safe response", async () => {
  const base = new FixedResponseAgent();
  const agent = new KnowledgeEnrichedAgent({
    agent: base,
    knowledgeClient: { query: async () => { throw new Error("offline"); } },
  });
  const response = await agent.handleMessage("knowledge-session", "继续");
  assert.equal(response.action, base.decision.action);
  assert.equal(response.disposition, base.decision.disposition);
  assert.equal(response.riskLevel, base.decision.riskLevel);
  assert.equal(response.decisionTraceId, base.decision.decisionTraceId);
  assert.equal(response.knowledgeSupport.status, "unavailable");
  assert.deepEqual(response.knowledgeSupport.sources, []);
});

test("emergency response is returned immediately without a knowledge call", async () => {
  const base = new FixedResponseAgent({
    disposition: Disposition.EMERGENCY_NOW,
    action: AgentAction.SAFETY_ESCALATION,
  });
  let calls = 0;
  const agent = new KnowledgeEnrichedAgent({
    agent: base,
    knowledgeClient: { query: async () => { calls += 1; } },
  });
  const response = await agent.handleMessage("knowledge-session", "继续");
  assert.equal(calls, 0);
  assert.equal(response.disposition, Disposition.EMERGENCY_NOW);
  assert.equal(response.knowledgeSupport.status, "not_requested");
});

test("Node Agent API integrates with the Python knowledge REST contract", async () => {
  let received;
  const knowledgeServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const body = JSON.stringify(approvedPayload("NHS_HEADACHE_2024"));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(body);
  });
  await listen(knowledgeServer);
  const agent = knowledgeAgent(new PythonKnowledgeServiceClient({
    baseUrl: `http://127.0.0.1:${knowledgeServer.address().port}`,
  }));
  const api = createAgentApiServer({ loop: agent });
  await listen(api);
  try {
    const created = await jsonFetch(`http://127.0.0.1:${api.address().port}/v1/sessions`, {
      method: "POST",
      body: JSON.stringify({ context: {} }),
    });
    const response = await jsonFetch(
      `http://127.0.0.1:${api.address().port}/v1/sessions/${created.sessionId}/messages`,
      { method: "POST", body: JSON.stringify({ message: "继续" }) },
    );
    assert.deepEqual(received, { topic: "headache", intent: "health_education", limit: 2 });
    assert.equal(response.knowledgeSupport.status, "available");
    assert.equal(response.disposition, Disposition.CLINIC_SOON);
  } finally {
    await close(api);
    await close(knowledgeServer);
  }
});

class FixedResponseAgent {
  constructor({
    disposition = Disposition.CLINIC_SOON,
    action = AgentAction.DISPOSITION,
  } = {}) {
    this.state = fixedState("knowledge-session", "headache", disposition);
    this.decision = fixedDecision("knowledge-session", disposition, action);
  }

  startSession() { return this.state.sessionId; }
  restoreSession() { return this.state.sessionId; }
  exportSession() { return JSON.stringify(this.state); }
  getSession() { return { responseLayerVersion: "test", state: structuredClone(this.state) }; }
  getAudit() { return []; }
  getDecisionTraces() { return []; }
  async handleMessage() { return structuredClone(this.decision); }
}

function knowledgeAgent(client) {
  return new KnowledgeEnrichedAgent({
    agent: new FixedResponseAgent(),
    knowledgeClient: client,
  });
}

function fixedDecision(sessionId, disposition, action = AgentAction.DISPOSITION) {
  return {
    sessionId,
    action,
    disposition,
    reasonCodes: ["CORE_REASON"],
    message: "建议近期安排门诊评估。",
    guidance: ["请联系医疗专业人员。"],
    warnings: ["如症状加重，请立即寻求帮助。"],
    riskLevel: disposition,
    summary: "建议近期安排门诊评估。",
    reasoning: ["由现有安全规则生成。"],
    recommendedAction: ["请联系医疗专业人员。"],
    warningSigns: ["如症状加重，请立即寻求帮助。"],
    followUpQuestions: [],
    decisionTraceId: "loop-trace",
    coreDecisionTraceId: "core-trace",
  };
}

function fixedState(sessionId, chiefComplaint, disposition) {
  return {
    sessionId,
    chiefComplaint: { code: chiefComplaint },
    decisionState: { action: AgentAction.DISPOSITION, disposition, reasonCodes: [] },
  };
}

function approvedPayload(sourceId) {
  const source = APPROVED_KNOWLEDGE_SOURCES[sourceId];
  return {
    serviceVersion: "test-knowledge-service",
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

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
}

async function jsonFetch(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  assert.equal(response.ok, true);
  return response.json();
}
