import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  FactStatus,
  MedicalSafetyAgent,
  assertActionTransition,
  createCaseState,
  getFactStatus,
  mergeFacts,
  restoreCaseState,
  serializeCaseState,
} from "../src/index.js";

test("generic CaseState has no pathway-specific fields in its base schema", () => {
  const state = createCaseState();
  const serialized = JSON.stringify(state);

  assert.doesNotMatch(serialized, /headache|chest_pain|thunderclap|dyspnea/i);
  assert.deepEqual(state.symptoms, {});
  assert.deepEqual(state.redFlags, {});
});

test("CaseState distinguishes known true, known false, and unknown", () => {
  const state = createCaseState();
  mergeFacts(state, {
    redFlags: {
      neurologicalDeficit: true,
      recentHeadTrauma: false,
    },
  });

  assert.equal(
    getFactStatus(state, "redFlags.neurologicalDeficit"),
    FactStatus.KNOWN,
  );
  assert.equal(
    getFactStatus(state, "redFlags.recentHeadTrauma"),
    FactStatus.KNOWN,
  );
  assert.equal(
    getFactStatus(state, "redFlags.alteredConsciousness"),
    FactStatus.UNKNOWN,
  );
});

test("CaseState preserves unknown and refused as explicit fact states", () => {
  const state = createCaseState();
  mergeFacts(state, {
    factStatuses: {
      "symptoms.onsetPattern": FactStatus.UNKNOWN,
      "redFlags.neurologicalDeficit": FactStatus.REFUSED,
    },
  });

  assert.equal(
    getFactStatus(state, "symptoms.onsetPattern"),
    FactStatus.UNKNOWN,
  );
  assert.equal(
    getFactStatus(state, "redFlags.neurologicalDeficit"),
    FactStatus.REFUSED,
  );
});

test("a corrected fact retains conflict history and the latest structured value", () => {
  const state = createCaseState();
  state.turnCount = 1;
  mergeFacts(state, { symptoms: { onsetPattern: "gradual" } });
  state.turnCount = 3;
  mergeFacts(state, { symptoms: { onsetPattern: "sudden_severe" } });

  assert.equal(state.symptoms.onsetPattern, "sudden_severe");
  assert.equal(
    getFactStatus(state, "symptoms.onsetPattern"),
    FactStatus.CONFLICTING,
  );
  assert.deepEqual(state.factMetadata["symptoms.onsetPattern"].values, [
    "gradual",
    "sudden_severe",
  ]);
});

test("repeated identical answers do not create a false conflict", () => {
  const state = createCaseState();
  mergeFacts(state, { redFlags: { neurologicalDeficit: false } });
  mergeFacts(state, { redFlags: { neurologicalDeficit: false } });

  assert.equal(
    getFactStatus(state, "redFlags.neurologicalDeficit"),
    FactStatus.KNOWN,
  );
  assert.deepEqual(
    state.factMetadata["redFlags.neurologicalDeficit"].values,
    [false],
  );
});

test("sessions are isolated and do not leak pathway facts", () => {
  const agent = new MedicalSafetyAgent();
  const headacheSession = agent.startSession({ adultConfirmed: true });
  const chestSession = agent.startSession({ adultConfirmed: true });

  agent.handleMessage(headacheSession, "我头痛");
  agent.handleMessage(chestSession, "我胸痛");

  assert.equal(agent.getState(headacheSession).chiefComplaint.code, "headache");
  assert.equal(agent.getState(chestSession).chiefComplaint.code, "chest_pain");
  assert.equal(
    agent.getState(headacheSession).redFlags.difficultyBreathing,
    undefined,
  );
  assert.equal(
    agent.getState(chestSession).symptoms.onsetPattern,
    undefined,
  );
});

test("public snapshots cannot mutate the live session", () => {
  const agent = new MedicalSafetyAgent();
  const sessionId = agent.startSession({ adultConfirmed: true });
  agent.handleMessage(sessionId, "我头痛");

  const snapshot = agent.getState(sessionId);
  snapshot.decisionState.reasonCodes.push("INJECTED");
  snapshot.askedQuestionIds.push("INJECTED");

  const fresh = agent.getState(sessionId);
  assert.doesNotMatch(JSON.stringify(fresh), /INJECTED/);
});

test("CaseState can be serialized, restored, and continue execution", () => {
  const firstAgent = new MedicalSafetyAgent();
  const sessionId = firstAgent.startSession({ adultConfirmed: true });
  firstAgent.handleMessage(sessionId, "我头痛");
  const serialized = firstAgent.exportSession(sessionId);

  const restoredObject = restoreCaseState(serialized);
  assert.equal(serializeCaseState(restoredObject), serialized);

  const secondAgent = new MedicalSafetyAgent();
  secondAgent.restoreSession(serialized);
  const response = secondAgent.handleMessage(sessionId, "逐渐出现");
  assert.equal(response.question.id, "HEADACHE_NEURO");
});

test("restoration rejects incompatible CaseState schema versions", () => {
  const serialized = JSON.stringify({
    ...createCaseState(),
    schemaVersion: 999,
  });
  assert.throws(() => restoreCaseState(serialized), /Unsupported CaseState/);
});

test("state machine accepts legal transitions and rejects illegal downgrades", () => {
  assert.equal(
    assertActionTransition(AgentAction.ASK_MORE, AgentAction.SAFETY_ESCALATION),
    true,
  );
  assert.equal(
    assertActionTransition(
      AgentAction.DISPOSITION,
      AgentAction.SAFETY_ESCALATION,
    ),
    true,
  );
  assert.throws(
    () =>
      assertActionTransition(
        AgentAction.SAFETY_ESCALATION,
        AgentAction.ASK_MORE,
      ),
    /Illegal agent action transition/,
  );
  assert.throws(
    () =>
      assertActionTransition(
        AgentAction.SAFETY_ESCALATION,
        AgentAction.DISPOSITION,
      ),
    /Illegal agent action transition/,
  );
});
