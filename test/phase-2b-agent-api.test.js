import test from "node:test";
import assert from "node:assert/strict";

import {
  createAgentApiServer,
  HybridSemanticValidator,
  MultiTurnAgentLoop,
  SEMANTIC_SCHEMA_VERSION,
  SemanticExtractor,
  TargetedVerifier,
} from "../src/index.js";

test("Agent REST API creates a session, handles turns and exposes sanitized traces", async () => {
  const loop = createLoop();
  const server = createAgentApiServer({ loop });
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await jsonFetch(`${base}/v1/sessions`, {
      method: "POST",
      body: JSON.stringify({ context: { adultConfirmed: true } }),
    });
    assert.ok(created.sessionId);
    assert.equal(created.state.sessionId, created.sessionId);

    const turn = await jsonFetch(`${base}/v1/sessions/${created.sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: "我胸痛" }),
    });
    assert.equal(turn.sessionId, created.sessionId);
    assert.equal(turn.action, "ASK_MORE");
    assert.equal(turn.question.id, "CHEST_PAIN_BREATHING");

    const session = await jsonFetch(`${base}/v1/sessions/${created.sessionId}`);
    assert.equal(session.state.chiefComplaint.code, "chest_pain");
    const traces = await jsonFetch(`${base}/v1/sessions/${created.sessionId}/traces`);
    assert.equal(traces.traces.length, 1);
    assert.equal(Object.hasOwn(traces.traces[0], "message"), false);
  } finally {
    await close(server);
  }
});

test("Agent REST API rejects invalid messages and unknown sessions", async () => {
  const server = createAgentApiServer({ loop: createLoop() });
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const bad = await fetch(`${base}/v1/sessions/missing/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "我胸痛" }),
    });
    assert.equal(bad.status, 404);
    const empty = await fetch(`${base}/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const created = await empty.json();
    const invalid = await fetch(`${base}/v1/sessions/${created.sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await close(server);
  }
});

function createLoop() {
  const provider = {
    name: "api-test",
    model: "fixed",
    generate: async ({ schemaName = "clinical_fact_extraction" }) => JSON.stringify(
      schemaName === "targeted_fact_verification"
        ? { verdict: "SUPPORTED" }
        : {
            schemaVersion: SEMANTIC_SCHEMA_VERSION,
            pathway: "CHEST_PAIN_V1",
            facts: [fact("chiefComplaint.code", "chest_pain")],
          },
    ),
  };
  return new MultiTurnAgentLoop({
    extractor: new SemanticExtractor({ provider }),
    hybridValidator: new HybridSemanticValidator({ verifier: new TargetedVerifier({ provider }) }),
  });
}

function fact(path, value) {
  return {
    path, value, status: "known", confidence: 1,
    temporality: "current", contradictionCandidate: false,
  };
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  assert.equal(response.ok, true, `${response.status} ${url}`);
  return response.json();
}
