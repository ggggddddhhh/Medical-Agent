import { findFactEvidence } from "./fact-evidence.js";
import {
  isHighRiskSemanticPath,
  SafetySignalDetector,
} from "./safety-signal-detector.js";
import {
  decideSemanticFact,
  SemanticGateDecision,
} from "./semantic-gate.js";

export const HYBRID_SEMANTIC_VALIDATOR_VERSION = "hybrid-semantic-validator-0.1.0";

export class HybridSemanticValidator {
  #detector;
  #verifier;

  constructor({ detector = new SafetySignalDetector(), verifier } = {}) {
    if (!detector || typeof detector.detect !== "function") {
      throw new TypeError("HybridSemanticValidator requires detector.detect.");
    }
    if (!verifier || typeof verifier.verify !== "function") {
      throw new TypeError("HybridSemanticValidator requires verifier.verify.");
    }
    this.#detector = detector;
    this.#verifier = verifier;
  }

  get metadata() {
    return {
      validatorVersion: HYBRID_SEMANTIC_VALIDATOR_VERSION,
      verifierVersion: this.#verifier.metadata?.verifierVersion ?? "unknown",
      modelProvider: this.#verifier.metadata?.modelProvider ?? "unknown",
      modelName: this.#verifier.metadata?.modelName ?? "unknown",
    };
  }

  async validate({ message, protocol, extraction, contextFacts = [] }) {
    const detectorResult = this.#detector.detect({ message, protocol });
    const extractionFacts = extraction?.candidate?.facts ?? [];
    const llmFacts = new Map(extractionFacts.map((fact) => [fact.path, fact]));
    const detectorGroups = groupDetectorCandidates(detectorResult.candidates);
    const paths = new Set([...llmFacts.keys(), ...detectorGroups.keys()]);
    const decisions = [];

    for (const path of paths) {
      const detectorCandidate = aggregateDetectorCandidates(detectorGroups.get(path) ?? []);
      const llmFact = llmFacts.get(path) ?? null;
      const candidate = llmFact ?? detectorDerivedFact(path, detectorCandidate);
      if (!candidate) continue;
      const candidateSource = llmFact
        ? detectorCandidate ? "llm+detector" : "llm"
        : "detector";
      const evidence = findFactEvidence({
        message,
        fact: candidate,
        detectorCandidates: detectorGroups.get(path) ?? [],
      });
      const contextConflict = hasContextConflict(candidate, contextFacts);
      const verifierRequired = needsTargetedVerification({
        candidate,
        detectorCandidate,
        evidence,
        contextConflict,
      });
      const verifier = verifierRequired
        ? await this.#verifier.verify({
            message,
            candidate,
            evidence: evidence.evidence,
            pathway: protocol.code,
          })
        : null;
      decisions.push(decideSemanticFact({
        candidate,
        candidateSource,
        extractionValid: extraction?.validationStatus === "valid",
        detectorCandidate,
        evidence,
        verifier,
        verifierRequired,
        contextConflict,
        followUpProposal: followUpFor(protocol, path),
      }));
    }

    return {
      validatorVersion: HYBRID_SEMANTIC_VALIDATOR_VERSION,
      mode: "shadow",
      pathway: protocol.code,
      detector: detectorResult,
      extractionStatus: extraction?.extractionStatus ?? "missing",
      extractionValidationStatus: extraction?.validationStatus ?? "not_run",
      decisions,
      acceptedFacts: decisions
        .filter((item) => item.decision === SemanticGateDecision.ACCEPT)
        .map((item) => structuredClone(item.candidate)),
      shadowFollowUpProposals: [...new Set(decisions
        .map((item) => item.shadowFollowUpProposal)
        .filter(Boolean))],
      summary: summarize(decisions),
      clinicalStatus: "Clinical validation pending",
    };
  }
}

export function sanitizeHybridValidation(result) {
  return {
    validatorVersion: result.validatorVersion,
    mode: result.mode,
    pathway: result.pathway,
    detectorVersion: result.detector.detectorVersion,
    detectorCandidates: result.detector.candidates.map((item) => ({
      signal: item.signal,
      factPath: item.factPath,
      proposedValue: item.proposedValue,
      polarity: item.polarity,
      temporality: item.temporality,
      evidence: item.evidence.map(({ start, end }) => ({ start, end })),
    })),
    decisions: result.decisions.map((item) => ({
      factPath: item.factPath,
      decision: item.decision,
      reasonCodes: item.reasonCodes,
      candidate: item.candidate,
      candidateSource: item.candidateSource,
      evidenceMethod: item.evidence.method,
      evidenceCount: item.evidence.evidence.length,
      verifierStatus: item.verifier?.status ?? null,
      verifierVerdict: item.verifier?.verdict ?? null,
      verifierErrorCode: item.verifier?.errorCode ?? null,
      shadowFollowUpProposal: item.shadowFollowUpProposal,
    })),
    summary: result.summary,
    shadowFollowUpProposals: result.shadowFollowUpProposals,
    clinicalStatus: result.clinicalStatus,
  };
}

function groupDetectorCandidates(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const group = groups.get(candidate.factPath) ?? [];
    group.push(candidate);
    groups.set(candidate.factPath, group);
  }
  return groups;
}

function aggregateDetectorCandidates(candidates) {
  if (candidates.length === 0) return null;
  const polarities = new Set(candidates.map((item) => item.polarity));
  const values = new Set(candidates.map((item) => JSON.stringify(item.proposedValue)));
  const polarity = polarities.size > 1 || values.size > 1 ? "conflicting" : candidates[0].polarity;
  return {
    factPath: candidates[0].factPath,
    proposedValue: candidates[0].proposedValue,
    polarity,
    temporality: commonTemporality(candidates),
    signals: candidates.map((item) => item.signal),
  };
}

function commonTemporality(candidates) {
  const values = [...new Set(candidates.map((item) => item.temporality).filter((item) => item !== "unspecified"))];
  return values.length === 1 ? values[0] : "unspecified";
}

function detectorDerivedFact(path, detectorCandidate) {
  if (!detectorCandidate) return null;
  const base = {
    path,
    confidence: 1,
    temporality: detectorCandidate.temporality,
    contradictionCandidate: detectorCandidate.polarity === "conflicting",
  };
  if (["uncertain", "contextual", "conflicting"].includes(detectorCandidate.polarity)) {
    return { ...base, value: null, status: "uncertain" };
  }
  if (detectorCandidate.polarity === "negative") {
    if (typeof detectorCandidate.proposedValue !== "boolean") {
      return { ...base, value: null, status: "uncertain" };
    }
    return { ...base, value: false, status: "known" };
  }
  return { ...base, value: detectorCandidate.proposedValue, status: "known" };
}

function needsTargetedVerification({ candidate, detectorCandidate, evidence, contextConflict }) {
  if (contextConflict || candidate.contradictionCandidate) return true;
  if (["uncertain", "conflicting"].includes(candidate.status)) return true;
  if (detectorCandidate && isHighRiskSemanticPath(candidate.path)) return true;
  if (candidate.status === "known" && evidence.support !== "supporting") return true;
  return isHighRiskSemanticPath(candidate.path) && candidate.status === "known";
}

function hasContextConflict(candidate, contextFacts) {
  const prior = contextFacts.find((item) => item.path === candidate.path && item.status === "known");
  return Boolean(prior && candidate.status === "known" && JSON.stringify(prior.value) !== JSON.stringify(candidate.value));
}

function followUpFor(protocol, path) {
  const exact = protocol.questions?.find((question) => question.factPath === path)?.text;
  if (exact) return exact;
  if (["symptoms.suddenOnset", "symptoms.rapidPeak"].includes(path)) {
    return protocol.questions?.find((question) => question.id === "HEADACHE_ONSET")?.text ?? null;
  }
  if (path === "symptoms.persistentSevere") {
    return protocol.questions?.find((question) => question.id === "CHEST_PAIN_ACTIVE")?.text ?? null;
  }
  return null;
}

function summarize(decisions) {
  return Object.fromEntries(Object.values(SemanticGateDecision).map((decision) => [
    decision,
    decisions.filter((item) => item.decision === decision).length,
  ]));
}
