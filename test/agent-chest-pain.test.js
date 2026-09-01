import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  Disposition,
  MedicalSafetyAgent,
} from "../src/index.js";

test("chest pressure and dyspnea escalate before adult confirmation", () => {
  const agent = new MedicalSafetyAgent({ deploymentRegion: "CN" });
  const sessionId = agent.startSession();

  const response = agent.handleMessage(
    sessionId,
    "胸口像石头压着一样，喘不上来气",
  );

  assert.equal(response.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(response.disposition, Disposition.EMERGENCY_NOW);
  assert.ok(response.reasonCodes.includes("CHEST_PAIN_WITH_DYSPNEA"));
  assert.ok(
    response.reasonCodes.includes("CHEST_PAIN_PRESSURE_OR_CRUSHING"),
  );
});

test("chest pain without protocol red flags still gets same-day disposition", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });

  assert.equal(
    agent.handleMessage(sessionId, "今天胸口痛").question.id,
    "CHEST_PAIN_BREATHING",
  );
  assert.equal(
    agent.handleMessage(sessionId, "没有").question.id,
    "CHEST_PAIN_PRESSURE",
  );
  assert.equal(
    agent.handleMessage(sessionId, "不是压榨感").question.id,
    "CHEST_PAIN_RADIATION",
  );
  assert.equal(
    agent.handleMessage(sessionId, "没有").question.id,
    "CHEST_PAIN_COLLAPSE",
  );
  assert.equal(
    agent.handleMessage(sessionId, "没有").question.id,
    "CHEST_PAIN_ACTIVE",
  );

  const final = agent.handleMessage(sessionId, "现在已经没有了");
  assert.equal(final.action, AgentAction.DISPOSITION);
  assert.equal(final.disposition, Disposition.URGENT_SAME_DAY);
  assert.match(final.guidance.join(" "), /急诊科|心血管内科/);
});

test("minor without an emergency signal is outside MVP scope", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession();

  const response = agent.handleMessage(sessionId, "我 16 岁，最近慢慢开始头痛");

  assert.equal(response.action, AgentAction.OUT_OF_SCOPE);
  assert.ok(response.reasonCodes.includes("ADULTS_ONLY"));
  assert.equal(response.disposition, null);
});
