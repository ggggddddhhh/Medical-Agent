import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  MedicalSafetyAgent,
  SEMANTIC_SCHEMA_VERSION,
  SemanticExtractor,
  SemanticShadowAgent,
} from "../src/index.js";

test("shadow candidate cannot change response, state, disposition, or tool decisions", async () => {
  const core = new MedicalSafetyAgent();
  const extractor = new SemanticExtractor({
    provider: {
      name: "controlled",
      model: "malicious-shadow",
      async generate() {
        return {
          schemaVersion: SEMANTIC_SCHEMA_VERSION,
          pathway: "HEADACHE_V1",
          facts: [
            {
              path: "redFlags.neurologicalDeficit",
              value: true,
              status: "known",
              confidence: 1,
              temporality: "current",
              contradictionCandidate: false,
            },
          ],
        };
      },
    },
  });
  const shadow = new SemanticShadowAgent({ agent: core, extractor });
  const sessionId = shadow.startSession({ adultConfirmed: true });
  const response = shadow.handleMessage(sessionId, "我头痛");
  await shadow.waitForShadowEvaluations(sessionId);

  assert.equal(response.action, AgentAction.ASK_MORE);
  assert.equal(response.disposition, null);
  assert.equal(shadow.getState(sessionId).redFlags.neurologicalDeficit, undefined);
  assert.equal(shadow.getAudit(sessionId)[0].disposition, null);
  assert.equal(shadow.getShadowEvaluations(sessionId)[0].validationStatus, "valid");
});

test("LLM failure leaves deterministic safety core fully operational", async () => {
  const core = new MedicalSafetyAgent();
  const shadow = new SemanticShadowAgent({
    agent: core,
    extractor: new SemanticExtractor({
      provider: { name: "controlled", model: "down", generate() { throw new Error("offline"); } },
    }),
  });
  const sessionId = shadow.startSession({ adultConfirmed: true });
  const response = shadow.handleMessage(
    sessionId,
    "突然出现这辈子最严重的头痛",
  );
  await shadow.waitForShadowEvaluations(sessionId);
  assert.equal(response.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(response.disposition, "EMERGENCY_NOW");
  assert.equal(shadow.getShadowEvaluations(sessionId)[0].extractionStatus, "provider_error");
});

test("shadow evaluation is separated from production audit and stores no raw text", async () => {
  const marker = "隐私原文标记-SHADOW-777";
  const core = new MedicalSafetyAgent();
  const shadow = new SemanticShadowAgent({
    agent: core,
    extractor: new SemanticExtractor({
      provider: {
        name: "controlled",
        model: "empty-facts",
        generate: () => ({ schemaVersion: SEMANTIC_SCHEMA_VERSION, pathway: "HEADACHE_V1", facts: [] }),
      },
    }),
  });
  const sessionId = shadow.startSession({ adultConfirmed: true });
  shadow.handleMessage(sessionId, `我头痛，${marker}`);
  await shadow.waitForShadowEvaluations(sessionId);
  const production = JSON.stringify(shadow.getAudit(sessionId));
  const evaluation = JSON.stringify(shadow.getShadowEvaluations(sessionId));
  assert.doesNotMatch(production, new RegExp(marker));
  assert.doesNotMatch(evaluation, new RegExp(marker));
  assert.equal(shadow.getAudit(sessionId).some((item) => item.evaluationId), false);
  assert.equal(shadow.getShadowEvaluations(sessionId)[0].modelName, "empty-facts");
});
