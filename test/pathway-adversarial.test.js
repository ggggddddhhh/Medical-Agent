import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  Disposition,
  FactStatus,
  MedicalSafetyAgent,
} from "../src/index.js";

test("headache correction from gradual to sudden preserves conflict and escalates", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });

  agent.handleMessage(sessionId, "我头痛");
  const afterGradual = agent.handleMessage(sessionId, "慢慢开始的");
  assert.equal(afterGradual.question.id, "HEADACHE_NEURO");

  const corrected = agent.handleMessage(
    sessionId,
    "我想起来其实是一瞬间开始的，突然疼得受不了",
  );
  assert.equal(corrected.disposition, Disposition.EMERGENCY_NOW);
  assert.equal(
    agent.getState(sessionId).factMetadata["symptoms.onsetPattern"].status,
    FactStatus.CONFLICTING,
  );
});

test("headache unknown and refusal answers advance and terminate as insufficient", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });

  assert.equal(agent.handleMessage(sessionId, "我头痛").question.id, "HEADACHE_ONSET");
  assert.equal(agent.handleMessage(sessionId, "不知道").question.id, "HEADACHE_NEURO");
  assert.equal(agent.handleMessage(sessionId, "不记得").question.id, "HEADACHE_FEVER_NECK");
  assert.equal(agent.handleMessage(sessionId, "不想回答").question.id, "HEADACHE_CONSCIOUSNESS");
  assert.equal(agent.handleMessage(sessionId, "不清楚").question.id, "HEADACHE_TRAUMA");
  assert.equal(agent.handleMessage(sessionId, "记不清").question.id, "HEADACHE_SEVERITY");

  const final = agent.handleMessage(sessionId, "不愿回答");
  assert.equal(final.action, AgentAction.INSUFFICIENT_INFO);
  assert.equal(final.disposition, Disposition.INSUFFICIENT_INFORMATION);
  assert.ok(final.reasonCodes.includes("REQUIRED_FACTS_UNAVAILABLE"));
  assert.equal(agent.getState(sessionId).closed, true);
});

test("unparseable repeated answers reach the maximum-turn safety termination", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });
  let response = agent.handleMessage(sessionId, "我头痛");

  for (let index = 0; index < 11 && response.action === AgentAction.ASK_MORE; index += 1) {
    response = agent.handleMessage(sessionId, "这条回答无法解析");
  }

  assert.equal(response.action, AgentAction.INSUFFICIENT_INFO);
  assert.equal(response.disposition, Disposition.INSUFFICIENT_INFORMATION);
  assert.ok(
    response.reasonCodes.includes("MAX_TURNS_WITH_REQUIRED_FACTS_MISSING"),
  );
});

test("ambiguous onset is not upgraded into fake deterministic NLP certainty", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });
  agent.handleMessage(sessionId, "我头痛");

  const ambiguous = agent.handleMessage(sessionId, "好像一下很疼");
  assert.equal(ambiguous.action, AgentAction.ASK_MORE);
  assert.equal(ambiguous.question.id, "HEADACHE_ONSET");

  const unknown = agent.handleMessage(sessionId, "不记得是不是突然");
  assert.equal(unknown.question.id, "HEADACHE_NEURO");
  assert.equal(
    agent.getState(sessionId).factMetadata["symptoms.onsetPattern"].status,
    FactStatus.UNKNOWN,
  );
});

test("explicit sudden unbearable headache is recognized after pathway selection", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });
  agent.handleMessage(sessionId, "我头痛");

  const response = agent.handleMessage(sessionId, "突然疼得受不了");
  assert.equal(response.action, AgentAction.SAFETY_ESCALATION);
  assert.equal(response.disposition, Disposition.EMERGENCY_NOW);
});

test("implicit metaphors remain documented deterministic extraction limitations", () => {
  for (const message of ["脑袋快炸了", "胸前勒得慌"]) {
    const agent = new MedicalSafetyAgent();
    const sessionId = agent.startSession({ adultConfirmed: true });
    const response = agent.handleMessage(sessionId, message);
    assert.equal(response.action, AgentAction.OUT_OF_SCOPE, message);
    assert.ok(response.reasonCodes.includes("UNSUPPORTED_CHIEF_COMPLAINT"));
  }
});

test("chest pain semantic variants trigger their explicit danger rules", () => {
  const cases = [
    ["胸口像压了块石头", "CHEST_PAIN_PRESSURE_OR_CRUSHING"],
    ["我胸痛，疼得冒冷汗", "CHEST_PAIN_COLLAPSE_OR_SWEATING"],
    ["我胸痛，刚才差点晕过去", "CHEST_PAIN_COLLAPSE_OR_SWEATING"],
    ["胸痛扩散到手臂和肩背", "CHEST_PAIN_RADIATION"],
  ];

  for (const [message, reason] of cases) {
    const agent = new MedicalSafetyAgent();
    const sessionId = agent.startSession({ adultConfirmed: true });
    const response = agent.handleMessage(sessionId, message);
    assert.equal(response.disposition, Disposition.EMERGENCY_NOW, message);
    assert.ok(response.reasonCodes.includes(reason), message);
  }
});

test("a short dyspnea reply is interpreted only inside the selected chest pathway", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });
  agent.handleMessage(sessionId, "我胸痛");

  const response = agent.handleMessage(sessionId, "喘不上来");
  assert.equal(response.disposition, Disposition.EMERGENCY_NOW);
  assert.ok(response.reasonCodes.includes("CHEST_PAIN_WITH_DYSPNEA"));
});

test("pregnancy is out of scope unless an emergency red flag requires escalation", () => {
  const routineAgent = new MedicalSafetyAgent();
  const routineSession = routineAgent.startSession();
  const routine = routineAgent.handleMessage(
    routineSession,
    "我怀孕了，头痛是逐渐出现的",
  );
  assert.equal(routine.action, AgentAction.OUT_OF_SCOPE);
  assert.ok(routine.reasonCodes.includes("PREGNANCY_OUT_OF_SCOPE"));

  const emergencyAgent = new MedicalSafetyAgent();
  const emergencySession = emergencyAgent.startSession();
  const emergency = emergencyAgent.handleMessage(
    emergencySession,
    "我怀孕了，突然一下剧烈头痛，是最严重的一次",
  );
  assert.equal(emergency.disposition, Disposition.EMERGENCY_NOW);
});

test("scope boundaries cover children, reports, diagnosis requests, and non-medical input", () => {
  const cases = [
    ["我 12 岁，头痛", "ADULTS_ONLY"],
    ["帮我解读这份血常规检查报告", "UNSUPPORTED_CHIEF_COMPLAINT"],
    ["我是不是得了偏头痛？", "DIAGNOSIS_BOUNDARY"],
    ["帮我写一首诗", "UNSUPPORTED_CHIEF_COMPLAINT"],
  ];

  for (const [message, reason] of cases) {
    const agent = new MedicalSafetyAgent();
    const sessionId = agent.startSession();
    const response = agent.handleMessage(sessionId, message);
    assert.equal(response.action, AgentAction.OUT_OF_SCOPE, message);
    assert.ok(response.reasonCodes.includes(reason), message);
    assert.equal(response.question, undefined, message);
  }
});
