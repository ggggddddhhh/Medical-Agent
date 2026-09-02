import { decideSemanticFact } from "../semantic/semantic-gate.js";
import { isHighRiskSemanticPath } from "../semantic/safety-signal-detector.js";

export const CLARIFICATION_ANSWER_RESOLVER_VERSION = "clarification-answer-resolver-0.1.0";

const PATIENT = /(?:是|就是|说的是|症状是)?(?:我本人|我自己|本人|我的|是我)(?!朋友|家人)/;
const OTHER = /(?:不是|并非)我|(?:是|就是|说的是|症状是)?(?:朋友|家人|家属|爱人|同事|同学|室友|邻居|父亲|母亲|爸爸|妈妈|丈夫|妻子|孩子|他|她)/;
const NEGATIVE = /没有|没发生|不是|并非|否认|无|不再/;
const POSITIVE = /确实|真的|有|是的|对|发生了|正在|仍然|是/;

export class ClarificationAnswerResolver {
  resolve({ message, pending }) {
    if (typeof message !== "string" || !pending?.decision) return null;
    const original = pending.decision;
    const subjectQuestion = pending.reasonCodes?.includes("SUBJECT_UNCERTAIN");
    const subject = subjectQuestion ? resolveSubject(message) : "patient";
    if (subjectQuestion && subject === "unclear") return null;

    const proposedValue = valueFor(pending, original);
    const value = subjectQuestion ? proposedValue : resolveValue(message, proposedValue);
    if (value === undefined) return null;
    const candidate = {
      path: original.factPath,
      value,
      status: "known",
      confidence: 1,
      temporality: resolveTemporality(message, original.candidate?.temporality),
      contradictionCandidate: false,
    };
    const answerEvidence = {
      text: message,
      start: 0,
      end: message.length,
      source: "clarification_answer",
      exact: true,
    };
    const assertion = {
      ...structuredClone(original.assertion),
      assertionId: `${original.assertion?.assertionId ?? "assertion"}+clarification`,
      evidenceExact: true,
      subject,
      polarity: typeof value === "boolean" && value === false ? "negative" : "positive",
      certainty: "certain",
      temporality: candidate.temporality,
      quote: false,
      hypothetical: false,
      explicitCorrection: false,
      evidence: [...(original.assertion?.evidence ?? []), answerEvidence],
    };
    const evidence = {
      ...(structuredClone(original.evidence) ?? {}),
      support: "supporting",
      method: "multi_turn_clarification",
      temporality: candidate.temporality,
      evidence: [...(original.evidence?.evidence ?? []), answerEvidence],
    };
    return decideSemanticFact({
      candidate,
      candidateSource: "multi_turn_clarification",
      extractionValid: true,
      evidence,
      assertion,
      verifier: original.verifier ?? null,
      verifierRequired: isHighRiskSemanticPath(candidate.path),
      clarification: null,
      followUpProposal: pending.question,
    });
  }
}

function resolveSubject(message) {
  if (OTHER.test(message)) return "other";
  if (PATIENT.test(message)) return "patient";
  return "unclear";
}

function resolveValue(message, proposedValue) {
  if (typeof proposedValue === "boolean") {
    if (NEGATIVE.test(message)) return false;
    if (POSITIVE.test(message)) return true;
    return undefined;
  }
  if (proposedValue !== undefined && POSITIVE.test(message)) return proposedValue;
  return undefined;
}

function valueFor(pending, decision) {
  if (pending.proposedValue !== undefined) {
    return structuredClone(pending.proposedValue);
  }
  if (decision.candidate?.value !== null && decision.candidate?.value !== undefined) {
    return structuredClone(decision.candidate.value);
  }
  const hint = decision.assertion?.conceptHints?.find((item) =>
    item.factPath === decision.factPath && !["parse_duration", "parse_severity"].includes(item.proposedValue));
  return hint ? structuredClone(hint.proposedValue) : undefined;
}

function resolveTemporality(message, fallback = "current") {
  if (/现在|目前|此刻|正在|仍然|还在/.test(message)) return "current";
  if (/以前|之前|过去|昨天|上周|当时/.test(message)) return "previous";
  return fallback === "unspecified" ? "current" : fallback;
}
