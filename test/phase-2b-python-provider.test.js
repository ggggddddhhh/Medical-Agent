import test from "node:test";
import assert from "node:assert/strict";

import {
  createPhase2BAgentLoop,
  PythonAiServiceProvider,
  SEMANTIC_SCHEMA_VERSION,
} from "../src/index.js";

test("Python AI provider sends Node-owned prompt and schema without model credentials", async () => {
  let request;
  const provider = new PythonAiServiceProvider({
    baseUrl: "http://python-ai.test/",
    model: "controlled-model",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({
        serviceVersion: "test-service",
        outputText: { ok: true },
        metadata: { responseId: "r1", modelSnapshot: "snapshot", responseStatus: "completed" },
      });
    },
  });
  const result = await provider.generate({
    message: "patient statement",
    systemInstruction: "node instruction",
    jsonSchema: { type: "object" },
    schemaName: "test_schema",
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "http://python-ai.test/v1/model/responses");
  assert.equal(body.systemInstruction, "node instruction");
  assert.deepEqual(body.jsonSchema, { type: "object" });
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(result.outputText.ok, true);
  assert.equal(result.metadata.modelSnapshot, "snapshot");
});

test("Python AI provider fails closed on HTTP and envelope errors", async () => {
  const httpFailure = new PythonAiServiceProvider({
    fetchImpl: async () => response({}, 503),
  });
  await assert.rejects(() => httpFailure.generate(requestInput()), /returned 503/);

  const malformed = new PythonAiServiceProvider({
    fetchImpl: async () => response({ unexpected: true }),
  });
  await assert.rejects(() => malformed.generate(requestInput()), /invalid response envelope/);
});

test("Phase 2B factory connects the HTTP provider to extraction, Gate and Core", async () => {
  let calls = 0;
  const loop = createPhase2BAgentLoop({
    pythonServiceUrl: "http://python-ai.test",
    fetchImpl: async (_url, options) => {
      calls += 1;
      const requestBody = JSON.parse(options.body);
      assert.equal(requestBody.schemaName, "clinical_fact_extraction");
      return response({
        outputText: {
          schemaVersion: SEMANTIC_SCHEMA_VERSION,
          pathway: "CHEST_PAIN_V1",
          facts: [{
            path: "chiefComplaint.code",
            value: "chest_pain",
            status: "known",
            confidence: 1,
            temporality: "current",
            contradictionCandidate: false,
          }],
        },
        metadata: { modelSnapshot: "controlled" },
      });
    },
  });
  const sessionId = loop.startSession({ adultConfirmed: true });
  const result = await loop.handleMessage(sessionId, "我胸痛");
  assert.equal(calls, 1);
  assert.equal(result.semantic.fallbackToSafetyCore, false);
  assert.equal(result.question.id, "CHEST_PAIN_BREATHING");
  assert.equal(loop.getSession(sessionId).state.chiefComplaint.code, "chest_pain");
});

function requestInput() {
  return {
    message: "test",
    systemInstruction: "test",
    jsonSchema: { type: "object" },
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => structuredClone(body),
  };
}
