import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  createAgentApiServer,
  ResponseLayerAgent,
} from "../src/index.js";

test("Agent REST API exposes the Phase 2C user-facing response contract", async () => {
  const sessionId = "phase-2c-api-session";
  const state = {
    sessionId,
    symptoms: {},
    decisionState: { action: AgentAction.ASK_MORE, disposition: null, reasonCodes: [] },
  };
  const decision = {
    sessionId,
    action: AgentAction.ASK_MORE,
    disposition: null,
    reasonCodes: ["CHEST_PAIN_BREATHING"],
    message: "胸痛时有没有呼吸困难？",
    question: { id: "CHEST_PAIN_BREATHING", text: "胸痛时有没有呼吸困难？" },
    guidance: [],
    warnings: [],
    decisionTraceId: "loop-trace",
    coreDecisionTraceId: "core-trace",
  };
  const loop = new ResponseLayerAgent({
    loop: {
      startSession: () => sessionId,
      getSession: () => ({ loopVersion: "api-fixed", state: structuredClone(state) }),
      getDecisionTraces: () => [],
      getAudit: () => [],
      exportSession: () => JSON.stringify(state),
      restoreSession: () => sessionId,
      handleMessage: async () => structuredClone(decision),
    },
  });
  const server = createAgentApiServer({ loop });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const created = await jsonFetch(`${base}/v1/sessions`, {
      method: "POST",
      body: JSON.stringify({ context: { adultConfirmed: true } }),
    });
    const response = await jsonFetch(`${base}/v1/sessions/${created.sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: "我胸痛" }),
    });

    assert.deepEqual(
      Object.keys(response).filter((key) => [
        "riskLevel",
        "summary",
        "reasoning",
        "recommendedAction",
        "warningSigns",
        "followUpQuestions",
      ].includes(key)).sort(),
      [
        "followUpQuestions",
        "reasoning",
        "recommendedAction",
        "riskLevel",
        "summary",
        "warningSigns",
      ],
    );
    assert.equal(response.riskLevel, AgentAction.ASK_MORE);
    assert.deepEqual(response.followUpQuestions, [decision.question.text]);
    assert.equal(response.action, decision.action);
    assert.equal(response.decisionTraceId, decision.decisionTraceId);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
});

async function jsonFetch(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  assert.equal(response.ok, true);
  return response.json();
}
