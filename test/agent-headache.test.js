import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  Disposition,
  MedicalSafetyAgent,
} from "../src/index.js";

test("unknown adult status is requested before ordinary protocol questions", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession();

  const first = agent.handleMessage(sessionId, "我头痛");
  assert.equal(first.action, AgentAction.ASK_MORE);
  assert.equal(first.question.id, "CONFIRM_ADULT");

  const second = agent.handleMessage(sessionId, "是，我是成年人");
  assert.equal(second.action, AgentAction.ASK_MORE);
  assert.equal(second.question.id, "HEADACHE_ONSET");
});

test("headache pathway asks only the next highest-priority missing question", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });

  const response = agent.handleMessage(sessionId, "我头很痛");

  assert.equal(response.action, AgentAction.ASK_MORE);
  assert.equal(response.question.id, "HEADACHE_ONSET");
  assert.equal(agent.getState(sessionId).askedQuestionIds, undefined);
  assert.match(response.notice, /人工智能/);
});

test("thunderclap headache stops questions and escalates immediately", () => {
  const agent = new MedicalSafetyAgent({ deploymentRegion: "CN" });
  const sessionId = agent.startSession({ adultConfirmed: true });

  agent.handleMessage(sessionId, "我头很痛");
  const response = agent.handleMessage(
    sessionId,
    "突然一下就痛得特别厉害，是这辈子最严重的一次",
  );

  assert.equal(response.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(response.disposition, Disposition.EMERGENCY_NOW);
  assert.ok(response.reasonCodes.includes("HEADACHE_THUNDERCLAP"));
  assert.match(response.guidance.join(" "), /120/);
  assert.equal(response.question, undefined);
  assert.equal(agent.getState(sessionId).closed, true);
});

test("semantic neurological danger signal triggers emergency policy", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });

  const response = agent.handleMessage(
    sessionId,
    "我头晕头痛，左边身体突然没劲，说话也不利索",
  );

  assert.equal(response.disposition, Disposition.EMERGENCY_NOW);
  assert.ok(
    response.reasonCodes.includes("HEADACHE_FOCAL_NEUROLOGICAL_DEFICIT"),
  );
});

test("mild headache with all protocol red flags denied reaches self-monitor", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });

  assert.equal(
    agent.handleMessage(sessionId, "我头痛").question.id,
    "HEADACHE_ONSET",
  );
  assert.equal(
    agent.handleMessage(sessionId, "是慢慢出现的").question.id,
    "HEADACHE_NEURO",
  );
  assert.equal(
    agent.handleMessage(sessionId, "没有").question.id,
    "HEADACHE_FEVER_NECK",
  );
  assert.equal(
    agent.handleMessage(sessionId, "没有").question.id,
    "HEADACHE_TRAUMA",
  );
  assert.equal(
    agent.handleMessage(sessionId, "没有").question.id,
    "HEADACHE_SEVERITY",
  );

  const final = agent.handleMessage(sessionId, "大概 3 分");
  assert.equal(final.action, AgentAction.DISPOSITION);
  assert.equal(final.disposition, Disposition.SELF_MONITOR);
  assert.match(final.warnings.join(" "), /肢体无力/);
});

test("high-severity headache reaches same-day care and department tool", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });

  agent.handleMessage(sessionId, "我头痛");
  agent.handleMessage(sessionId, "逐渐出现");
  agent.handleMessage(sessionId, "没有");
  agent.handleMessage(sessionId, "没有");
  agent.handleMessage(sessionId, "没有");
  const final = agent.handleMessage(sessionId, "8 分");

  assert.equal(final.disposition, Disposition.URGENT_SAME_DAY);
  assert.match(final.guidance.join(" "), /神经内科|全科/);

  const lastTrace = agent.getAudit(sessionId).at(-1);
  assert.ok(lastTrace.actions.includes(AgentAction.CALL_TOOL));
  assert.equal(lastTrace.tools[0].name, "department_router");
});
