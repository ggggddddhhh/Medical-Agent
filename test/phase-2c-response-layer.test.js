import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAction,
  Disposition,
  FUTURE_LIGHTRAG_BOUNDARY,
  HybridSemanticValidator,
  MultiTurnAgentLoop,
  RESPONSE_LAYER_VERSION,
  ResponseGenerator,
  ResponseLayerAgent,
  ResponseSafetyError,
  ResponseSafetyGuard,
  SEMANTIC_SCHEMA_VERSION,
  SemanticExtractor,
  TargetedVerifier,
  createCanonicalUserResponse,
  createPhase2CAgentLoop,
} from "../src/index.js";

test("Response Layer converts a Core clarification into the six user-facing fields", async () => {
  const sessionId = "response-ask";
  const decision = fixedDecision(sessionId, {
    action: AgentAction.ASK_MORE,
    message: "您是否有呼吸困难？",
    question: { id: "CHEST_PAIN_BREATHING", text: "您是否有呼吸困难？" },
  });
  const loop = new FixedLoop(decision, fixedState(sessionId, AgentAction.ASK_MORE));
  const layer = new ResponseLayerAgent({ loop });

  const response = await layer.handleMessage(sessionId, "我胸痛");

  assert.equal(response.riskLevel, AgentAction.ASK_MORE);
  assert.equal(response.summary, decision.message);
  assert.deepEqual(response.followUpQuestions, [decision.question.text]);
  assert.deepEqual(response.warningSigns, []);
  assert.equal(response.responseLayerVersion, RESPONSE_LAYER_VERSION);
});

test("emergency response preserves the Core risk, action, reasons and instructions", async () => {
  const sessionId = "response-emergency";
  const decision = fixedDecision(sessionId, {
    action: AgentAction.SAFETY_ESCALATION,
    disposition: Disposition.EMERGENCY_NOW,
    reasonCodes: ["CHEST_PAIN_WITH_DYSPNEA"],
    message: "检测到需要立即处理的危险信号。系统不能判断具体病因。",
    guidance: ["立即拨打 120 或前往最近的急诊科。"],
    warnings: ["不要等待症状自行缓解，也不要自行驾车。"],
  });
  const loop = new FixedLoop(
    decision,
    fixedState(sessionId, AgentAction.SAFETY_ESCALATION, Disposition.EMERGENCY_NOW),
  );

  const response = await new ResponseLayerAgent({ loop }).handleMessage(sessionId, "继续");

  assert.equal(response.action, decision.action);
  assert.equal(response.disposition, decision.disposition);
  assert.equal(response.riskLevel, decision.disposition);
  assert.deepEqual(response.reasonCodes, decision.reasonCodes);
  assert.deepEqual(response.recommendedAction, decision.guidance);
  assert.deepEqual(response.warningSigns, decision.warnings);
  assert.doesNotMatch(JSON.stringify(response), /确诊|你患有|服用\s*\d+/);
});

test("non-canonical content cannot change risk or add an unsupported patient fact", async () => {
  const sessionId = "response-tamper";
  const decision = fixedDecision(sessionId, {
    action: AgentAction.DISPOSITION,
    disposition: Disposition.CLINIC_SOON,
    message: "建议近期安排门诊评估。",
  });
  const loop = new FixedLoop(
    decision,
    fixedState(sessionId, AgentAction.DISPOSITION, Disposition.CLINIC_SOON),
  );
  const responseGenerator = {
    generate({ decision: source }) {
      return {
        ...createCanonicalUserResponse(source),
        riskLevel: Disposition.SELF_MONITOR,
        summary: "患者已确诊心脏病。",
      };
    },
  };

  await assert.rejects(
    () => new ResponseLayerAgent({ loop, responseGenerator }).handleMessage(sessionId, "继续"),
    (error) => error instanceof ResponseSafetyError && error.code === "NON_CANONICAL_RESPONSE",
  );
});

test("the existing Output Safety policy is applied to every generated text field", () => {
  const sessionId = "response-output-safety";
  const decision = fixedDecision(sessionId, {
    action: AgentAction.DISPOSITION,
    disposition: Disposition.CLINIC_SOON,
    message: "你已经患有偏头痛。",
  });
  const state = fixedState(sessionId, AgentAction.DISPOSITION, Disposition.CLINIC_SOON);
  const candidate = new ResponseGenerator().generate({ decision, caseState: state });

  assert.throws(
    () => new ResponseSafetyGuard().validate({ candidate, decision, caseState: state }),
    (error) =>
      error instanceof ResponseSafetyError && error.code === "PROHIBITED_MEDICAL_CLAIM",
  );
});

test("a disposition not supported by CaseState is rejected", () => {
  const sessionId = "response-state-mismatch";
  const decision = fixedDecision(sessionId, {
    action: AgentAction.DISPOSITION,
    disposition: Disposition.URGENT_SAME_DAY,
    message: "建议当天评估。",
  });
  const state = fixedState(sessionId, AgentAction.DISPOSITION, Disposition.CLINIC_SOON);
  const candidate = createCanonicalUserResponse(decision);

  assert.throws(
    () => new ResponseSafetyGuard().validate({ candidate, decision, caseState: state }),
    (error) =>
      error instanceof ResponseSafetyError && error.code === "UNSUPPORTED_RISK_DECISION",
  );
});

test("Response Layer detects any CaseState mutation during generation", async () => {
  const sessionId = "response-mutation";
  const decision = fixedDecision(sessionId, {
    action: AgentAction.OUT_OF_SCOPE,
    message: "当前问题不在支持范围内。",
  });
  const loop = new FixedLoop(decision, fixedState(sessionId, AgentAction.OUT_OF_SCOPE));
  const responseGenerator = {
    generate({ decision: source }) {
      loop.state.symptoms.injected = true;
      return createCanonicalUserResponse(source);
    },
  };

  await assert.rejects(
    () => new ResponseLayerAgent({ loop, responseGenerator }).handleMessage(sessionId, "继续"),
    (error) => error instanceof ResponseSafetyError && error.code === "CASE_STATE_MUTATION",
  );
});

test("Phase 2C wraps the real Phase 2B multi-turn flow without replacing its session", async () => {
  const baseLoop = controlledPhase2BLoop();
  const layer = createPhase2CAgentLoop({ loop: baseLoop });
  const sessionId = layer.startSession({ adultConfirmed: true });

  const response = await layer.handleMessage(sessionId, "我胸痛");
  const session = layer.getSession(sessionId);

  assert.equal(response.sessionId, sessionId);
  assert.equal(session.state.sessionId, sessionId);
  assert.equal(session.state.chiefComplaint.code, "chest_pain");
  assert.equal(response.riskLevel, AgentAction.ASK_MORE);
  assert.deepEqual(response.followUpQuestions, [response.question.text]);
  assert.equal(session.responseLayerVersion, RESPONSE_LAYER_VERSION);
});

test("future LightRAG boundary is disabled and cannot own clinical decisions", () => {
  assert.equal(FUTURE_LIGHTRAG_BOUNDARY.enabled, false);
  assert.deepEqual(FUTURE_LIGHTRAG_BOUNDARY.allowedOutputs, [
    "generalMedicalExplanation",
    "sourceCitations",
  ]);
  for (const field of ["riskLevel", "disposition", "caseStateMutation"]) {
    assert.ok(FUTURE_LIGHTRAG_BOUNDARY.forbiddenOutputs.includes(field));
  }
});

class FixedLoop {
  constructor(decision, state) {
    this.decision = structuredClone(decision);
    this.state = structuredClone(state);
  }

  startSession() { return this.state.sessionId; }
  restoreSession() { return this.state.sessionId; }
  exportSession() { return JSON.stringify(this.state); }
  getSession() { return { loopVersion: "fixed", state: structuredClone(this.state) }; }
  getAudit() { return []; }
  getDecisionTraces() { return []; }
  async handleMessage() { return structuredClone(this.decision); }
}

function fixedDecision(sessionId, overrides) {
  return {
    sessionId,
    notice: "这是人工智能生成的分诊信息，不是诊断或处方。",
    action: null,
    disposition: null,
    reasonCodes: [],
    message: "",
    guidance: [],
    warnings: [],
    decisionTraceId: "loop-trace",
    coreDecisionTraceId: "core-trace",
    ...overrides,
  };
}

function fixedState(sessionId, action, disposition = null) {
  return {
    sessionId,
    symptoms: {},
    decisionState: { action, disposition, reasonCodes: [] },
  };
}

function controlledPhase2BLoop() {
  const provider = {
    name: "phase2c-controlled-provider",
    model: "fixed",
    async generate({ schemaName = "clinical_fact_extraction" }) {
      if (schemaName === "targeted_fact_verification") {
        return JSON.stringify({ verdict: "SUPPORTED" });
      }
      return JSON.stringify({
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
      });
    },
  };
  return new MultiTurnAgentLoop({
    extractor: new SemanticExtractor({ provider }),
    hybridValidator: new HybridSemanticValidator({
      verifier: new TargetedVerifier({ provider }),
    }),
  });
}
