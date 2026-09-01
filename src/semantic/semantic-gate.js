import { VerifierVerdict } from "./targeted-verifier.js";

export const SEMANTIC_GATE_VERSION = "semantic-gate-0.1.0";

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
  verifier = null,
  verifierRequired = false,
  contextConflict = false,
  followUpProposal = null,
}) {
  const base = {
    gateVersion: SEMANTIC_GATE_VERSION,
    factPath: candidate?.path ?? detectorCandidate?.factPath ?? null,
    candidate: candidate ? structuredClone(candidate) : null,
    candidateSource,
    evidence: structuredClone(evidence ?? { support: "none", method: "none", evidence: [] }),
    verifier: verifier ? structuredClone(verifier) : null,
    shadowFollowUpProposal: null,
  };
  const decide = (decision, ...reasonCodes) => ({
    ...base,
    decision,
    reasonCodes,
    shadowFollowUpProposal: decision === SemanticGateDecision.UNCERTAIN
      ? followUpProposal
      : null,
  });

  if (!candidate) return decide(SemanticGateDecision.REJECT, "NO_CANDIDATE_FACT");
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
    return decide(
      SemanticGateDecision.UNCERTAIN,
      detectorCandidate.polarity === "uncertain" ? "USER_UNCERTAINTY" : "CONTEXT_NOT_PATIENT_ASSERTION",
    );
  }
  if (["uncertain", "refused", "conflicting"].includes(candidate.status)) {
    return decide(SemanticGateDecision.UNCERTAIN, `CANDIDATE_${candidate.status.toUpperCase()}`);
  }
  if (candidate.status === "unknown") {
    return decide(
      SemanticGateDecision.UNCERTAIN,
      detectorCandidate?.polarity === "positive" ? "EXTRACTOR_DETECTOR_CONFLICT" : "NOT_MENTIONED",
    );
  }
  if (detectorCandidate?.polarity === "negative" && candidate.value !== false) {
    return decide(SemanticGateDecision.REJECT, "EXPLICIT_NEGATION_CONTRADICTS_CANDIDATE");
  }
  if (detectorCandidate?.polarity === "positive" && !sameValue(candidate.value, detectorCandidate.proposedValue)) {
    return decide(SemanticGateDecision.UNCERTAIN, "EXTRACTOR_DETECTOR_CONFLICT");
  }
  if (detectorCandidate && temporalityConflicts(candidate.temporality, detectorCandidate.temporality)) {
    return decide(SemanticGateDecision.UNCERTAIN, "TEMPORALITY_CONFLICT");
  }
  if (temporalityConflicts(candidate.temporality, evidence?.temporality)) {
    return decide(SemanticGateDecision.UNCERTAIN, "SOURCE_EVIDENCE_TEMPORALITY_CONFLICT");
  }
  if (candidate.status === "known" && evidence?.support !== "supporting") {
    return decide(SemanticGateDecision.REJECT, "KNOWN_FACT_WITHOUT_SOURCE_EVIDENCE");
  }
  if (verifierRequired) {
    if (!verifier || verifier.status !== "completed") {
      return decide(SemanticGateDecision.UNCERTAIN, "VERIFIER_FAILURE_FAIL_CLOSED");
    }
    if (verifier.verdict === VerifierVerdict.CONTRADICTED) {
      return decide(SemanticGateDecision.REJECT, "VERIFIER_CONTRADICTED");
    }
    if (verifier.verdict !== VerifierVerdict.SUPPORTED) {
      return decide(SemanticGateDecision.UNCERTAIN, "VERIFIER_UNCERTAIN");
    }
  }
  return decide(SemanticGateDecision.ACCEPT, "DIRECT_EVIDENCE_SUPPORTED");
}

function temporalityConflicts(left, right) {
  return left && right && left !== "unspecified" && right !== "unspecified" && left !== right;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
