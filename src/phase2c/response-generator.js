import { AgentAction, Disposition } from "../domain/constants.js";

export const RESPONSE_GENERATOR_VERSION = "response-generator-0.1.0";

export const RESPONSE_FIELDS = Object.freeze([
  "riskLevel",
  "summary",
  "reasoning",
  "recommendedAction",
  "warningSigns",
  "followUpQuestions",
]);

export class ResponseGenerator {
  generate({ decision, caseState } = {}) {
    assertDecision(decision);
    assertCaseState(caseState, decision.sessionId);
    return createCanonicalUserResponse(decision);
  }
}

export function createCanonicalUserResponse(decision) {
  assertDecision(decision);
  return {
    riskLevel: decision.disposition ?? decision.action,
    summary: decision.message,
    reasoning: reasoningFor(decision),
    recommendedAction: recommendedActionFor(decision),
    warningSigns: stringList(decision.warnings),
    followUpQuestions: followUpQuestionsFor(decision),
  };
}

function reasoningFor(decision) {
  if (
    decision.action === AgentAction.SAFETY_ESCALATION ||
    decision.disposition === Disposition.EMERGENCY_NOW
  ) {
    return ["当前已确认的信息触发了现有安全规则中的危险信号，需要立即处理。"];
  }
  if (decision.action === AgentAction.ASK_MORE) {
    return ["目前仍缺少安全分流所需的信息，需要先完成针对性确认。"];
  }
  if (decision.action === AgentAction.OUT_OF_SCOPE) {
    return ["当前请求超出本版本经过验证的评估范围，系统不会据此作出诊断或风险推断。"];
  }
  if (
    decision.action === AgentAction.INSUFFICIENT_INFO ||
    decision.disposition === Disposition.INSUFFICIENT_INFORMATION
  ) {
    return ["现有信息不足以支持安全处置判断，因此未给出确定的风险结论。"];
  }
  if (decision.disposition === Disposition.URGENT_SAME_DAY) {
    return ["现有结构化信息支持当天由医疗专业人员进一步评估。"];
  }
  if (decision.disposition === Disposition.CLINIC_SOON) {
    return ["当前未触发立即急救条件，但现有信息支持近期门诊评估。"];
  }
  if (decision.disposition === Disposition.SELF_MONITOR) {
    return ["当前未触发本路径的危险信号，可按安全提示观察变化。"];
  }
  return ["系统仅根据当前 CaseState 和既有安全规则整理本次回复。"];
}

function recommendedActionFor(decision) {
  const guidance = stringList(decision.guidance);
  if (guidance.length > 0) return guidance;
  if (decision.action === AgentAction.ASK_MORE) {
    return ["请回答下面的追问，以便继续安全评估。"];
  }
  if (decision.action === AgentAction.OUT_OF_SCOPE) {
    return ["请根据上方提示联系合适的医疗专业人员。"];
  }
  if (decision.action === AgentAction.INSUFFICIENT_INFO) {
    return ["请联系医疗专业人员进行进一步评估。"];
  }
  return [];
}

function followUpQuestionsFor(decision) {
  if (decision.action !== AgentAction.ASK_MORE) return [];
  const question = decision.pendingClarification?.question?.text ?? decision.question?.text;
  return typeof question === "string" && question.trim().length > 0
    ? [question]
    : [];
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
}

function assertDecision(decision) {
  if (!decision || typeof decision !== "object") {
    throw new TypeError("ResponseGenerator requires a structured decision.");
  }
  if (typeof decision.action !== "string" || typeof decision.message !== "string") {
    throw new TypeError("Decision must contain action and message.");
  }
}

function assertCaseState(caseState, sessionId) {
  if (!caseState || typeof caseState !== "object") {
    throw new TypeError("ResponseGenerator requires a CaseState snapshot.");
  }
  if (caseState.sessionId !== sessionId) {
    throw new TypeError("Decision and CaseState must belong to the same session.");
  }
}
