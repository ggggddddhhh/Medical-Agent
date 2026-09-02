import { isHighRiskSemanticPath } from "./safety-signal-detector.js";
import { VerifierVerdict } from "./targeted-verifier.js";

export const SEMANTIC_GATE_VERSION = "semantic-gate-0.2.0";

export const SemanticGateDecision = Object.freeze({
  ACCEPT: "ACCEPT",
  UNCERTAIN: "UNCERTAIN",
  REJECT: "REJECT",
});

export function decideSemanticFact({
  candidate,
  candidateSource = "llm",
  extractionValid = true,
  detectorCandidate = null,
  evidence,
  assertion = null,
  verifier = null,
  verifierRequired = false,
  contextConflict = false,
  reconciliation = null,
  clarification = null,
  followUpProposal = null,
}) {
  const base = {
    gateVersion: SEMANTIC_GATE_VERSION,
    factPath: candidate?.path ?? detectorCandidate?.factPath ?? null,
    candidate: candidate ? structuredClone(candidate) : null,
    candidateSource,
    evidence: structuredClone(evidence ?? {
      support: "none",
      method: "none",
      evidence: [],
    }),
    assertion: assertion ? structuredClone(assertion) : null,
    verifier: verifier ? structuredClone(verifier) : null,
    reconciliation: reconciliation ? structuredClone(reconciliation) : null,
    clarification: clarification ? structuredClone(clarification) : null,
    shadowFollowUpProposal: null,
  };
  const followUp = clarification?.question ?? followUpProposal;
  const decide = (decision, ...reasonCodes) => ({
    ...base,
    decision,
    reasonCodes,
    shadowFollowUpProposal: decision === SemanticGateDecision.UNCERTAIN
      ? followUp ?? null
      : null,
  });

  if (!candidate) return decide(SemanticGateDecision.REJECT, "NO_CANDIDATE_FACT");
  if (!assertion) {
    return decideLegacy({
      candidate,
      candidateSource,
      extractionValid,
      detectorCandidate,
      evidence,
      verifier,
      verifierRequired,
      contextConflict,
      decide,
    });
  }
  if (!extractionValid && candidateSource === "llm") {
    return decide(SemanticGateDecision.REJECT, "SCHEMA_INVALID");
  }
  if (!hasVerifiedEvidence(evidence) || !assertion.evidenceExact) {
    return decide(SemanticGateDecision.REJECT, "KNOWN_FACT_WITHOUT_EXACT_EVIDENCE");
  }
  if (assertion.hypothetical) {
    return decide(SemanticGateDecision.REJECT, "HYPOTHETICAL_NOT_PATIENT_ASSERTION");
  }
  if (assertion.quote) {
    return decide(SemanticGateDecision.REJECT, "QUOTED_NOT_PATIENT_ASSERTION");
  }
  if (assertion.subject === "other") {
    return decide(SemanticGateDecision.REJECT, "OTHER_PERSON_NOT_PATIENT");
  }
  if (assertion.subject !== "patient") {
    return decide(SemanticGateDecision.UNCERTAIN, "SUBJECT_UNCLEAR");
  }
  if (
    candidate.status === "conflicting" ||
    assertion.polarity === "conflicting" ||
    (contextConflict && !reconciliation?.correctionApplied)
  ) {
    return decide(SemanticGateDecision.UNCERTAIN, "ASSERTION_OR_CONTEXT_CONFLICT");
  }
  if (assertion.certainty === "uncertain" || candidate.status === "uncertain") {
    return decide(SemanticGateDecision.UNCERTAIN, "USER_UNCERTAINTY");
  }
  if (["unknown", "refused"].includes(candidate.status)) {
    return decide(SemanticGateDecision.UNCERTAIN, "FACT_NOT_CONFIRMED");
  }
  if (!polarityMatches(candidate, assertion.polarity)) {
    return decide(SemanticGateDecision.REJECT, "POLARITY_VALUE_CONFLICT");
  }
  if (temporalityConflicts(candidate.temporality, assertion.temporality)) {
    return decide(SemanticGateDecision.UNCERTAIN, "ASSERTION_TEMPORALITY_CONFLICT");
  }
  if (
    verifierRequired &&
    verifier?.status === "completed" &&
    verifier.verdict === VerifierVerdict.CONTRADICTED &&
    isHighRiskSemanticPath(candidate.path)
  ) {
    return decide(SemanticGateDecision.UNCERTAIN, "VERIFIER_AUXILIARY_CONTRADICTION");
  }
  return decide(
    SemanticGateDecision.ACCEPT,
    reconciliation?.correctionApplied
      ? "EVIDENCE_GROUNDED_EXPLICIT_CORRECTION"
      : "EVIDENCE_GROUNDED_ASSERTION",
  );
}

function decideLegacy({
  candidate,
  candidateSource,
  extractionValid,
  detectorCandidate,
  evidence,
  verifier,
  verifierRequired,
  contextConflict,
  decide,
}) {
  if (!extractionValid && candidateSource.includes("llm")) {
    return decide(SemanticGateDecision.REJECT, "SCHEMA_INVALID");
  }
  if (contextConflict || candidate.status === "conflicting" || candidate.contradictionCandidate) {
    return decide(SemanticGateDecision.UNCERTAIN, "MULTI_TURN_OR_EXPLICIT_CONFLICT");
  }
  if (detectorCandidate?.polarity === "conflicting") {
    return decide(SemanticGateDecision.UNCERTAIN, "DETECTOR_INTERNAL_CONFLICT");
  }
  if (["uncertain", "contextual"].includes(detectorCandidate?.polarity)) {
    return decide(SemanticGateDecision.UNCERTAIN, "LEGACY_DETECTOR_AMBIGUITY");
  }
  if (["uncertain", "refused", "conflicting", "unknown"].includes(candidate.status)) {
    return decide(SemanticGateDecision.UNCERTAIN, "LEGACY_CANDIDATE_NOT_KNOWN");
  }
  if (detectorCandidate?.polarity === "negative" && candidate.value !== false) {
    return decide(SemanticGateDecision.REJECT, "EXPLICIT_NEGATION_CONTRADICTS_CANDIDATE");
  }
  if (
    detectorCandidate?.polarity === "positive" &&
    !sameValue(candidate.value, detectorCandidate.proposedValue)
  ) {
    return decide(SemanticGateDecision.UNCERTAIN, "EXTRACTOR_DETECTOR_CONFLICT");
  }
  if (temporalityConflicts(candidate.temporality, detectorCandidate?.temporality)) {
    return decide(SemanticGateDecision.UNCERTAIN, "TEMPORALITY_CONFLICT");
  }
  if (temporalityConflicts(candidate.temporality, evidence?.temporality)) {
    return decide(SemanticGateDecision.UNCERTAIN, "SOURCE_EVIDENCE_TEMPORALITY_CONFLICT");
  }
  if (candidate.status === "known" && evidence?.support !== "supporting") {
    return decide(SemanticGateDecision.REJECT, "KNOWN_FACT_WITHOUT_SOURCE_EVIDENCE");
  }
  if (verifierRequired && (!verifier || verifier.status !== "completed")) {
    return decide(SemanticGateDecision.UNCERTAIN, "VERIFIER_FAILURE_FAIL_CLOSED");
  }
  if (verifierRequired && verifier.verdict === VerifierVerdict.CONTRADICTED) {
    return decide(SemanticGateDecision.REJECT, "VERIFIER_CONTRADICTED");
  }
  if (verifierRequired && verifier.verdict !== VerifierVerdict.SUPPORTED) {
    return decide(SemanticGateDecision.UNCERTAIN, "VERIFIER_UNCERTAIN");
  }
  return decide(SemanticGateDecision.ACCEPT, "LEGACY_DIRECT_EVIDENCE_SUPPORTED");
}

function hasVerifiedEvidence(evidence) {
  return evidence?.support === "supporting" &&
    evidence.evidence?.length > 0 &&
    evidence.evidence.every((span) =>
      Number.isInteger(span.start) &&
      Number.isInteger(span.end) &&
      span.end > span.start &&
      span.exact !== false);
}

function polarityMatches(candidate, polarity) {
  if (candidate.status !== "known") return false;
  if (typeof candidate.value !== "boolean") return polarity === "positive";
  if (candidate.value === true) return polarity === "positive";
  return polarity === "negative";
}

function temporalityConflicts(left, right) {
  return left && right &&
    left !== "unspecified" &&
    right !== "unspecified" &&
    left !== right;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
