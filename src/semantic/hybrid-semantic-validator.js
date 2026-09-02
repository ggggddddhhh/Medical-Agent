import { ClarificationManager } from "./clarification-manager.js";
import { ConceptMapper } from "./concept-mapper.js";
import { ConversationReconciler } from "./conversation-reconciler.js";
import { EvidenceSpanFinder } from "./evidence-span-finder.js";
import { LinguisticAssertionLayer } from "./linguistic-assertion-layer.js";
import {
  isHighRiskSemanticPath,
  SafetySignalDetector,
} from "./safety-signal-detector.js";
import {
  decideSemanticFact,
  SemanticGateDecision,
} from "./semantic-gate.js";

export const HYBRID_SEMANTIC_VALIDATOR_VERSION = "hybrid-semantic-validator-0.2.0";

export class HybridSemanticValidator {
  #spanFinder;
  #assertionLayer;
  #detector;
  #conceptMapper;
  #clarificationManager;
  #reconciler;
  #verifier;

  constructor({
    spanFinder = new EvidenceSpanFinder(),
    assertionLayer = new LinguisticAssertionLayer(),
    detector = new SafetySignalDetector({ spanFinder }),
    conceptMapper = new ConceptMapper(),
    clarificationManager = new ClarificationManager(),
    reconciler = new ConversationReconciler(),
    verifier,
  } = {}) {
    if (!spanFinder || typeof spanFinder.find !== "function") {
      throw new TypeError("HybridSemanticValidator requires spanFinder.find.");
    }
    if (!assertionLayer || typeof assertionLayer.analyze !== "function") {
      throw new TypeError("HybridSemanticValidator requires assertionLayer.analyze.");
    }
    if (!detector || typeof detector.detect !== "function") {
      throw new TypeError("HybridSemanticValidator requires detector.detect.");
    }
    if (!conceptMapper || typeof conceptMapper.map !== "function") {
      throw new TypeError("HybridSemanticValidator requires conceptMapper.map.");
    }
    if (!clarificationManager || typeof clarificationManager.create !== "function") {
      throw new TypeError("HybridSemanticValidator requires clarificationManager.create.");
    }
    if (!reconciler || typeof reconciler.reconcile !== "function") {
      throw new TypeError("HybridSemanticValidator requires reconciler.reconcile.");
    }
    if (!verifier || typeof verifier.verify !== "function") {
      throw new TypeError("HybridSemanticValidator requires verifier.verify.");
    }
    this.#spanFinder = spanFinder;
    this.#assertionLayer = assertionLayer;
    this.#detector = detector;
    this.#conceptMapper = conceptMapper;
    this.#clarificationManager = clarificationManager;
    this.#reconciler = reconciler;
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
    const spanResult = this.#spanFinder.find({ message, protocol });
    const assertionResult = this.#assertionLayer.analyze({
      message,
      spans: spanResult.spans,
    });
    const detectorResult = this.#detector.detect({
      message,
      protocol,
      evidenceSpans: spanResult.spans,
    });
    const mappingResult = this.#conceptMapper.map({
      assertions: assertionResult.assertions,
      detectorCandidates: detectorResult.candidates,
      protocol,
    });
    const reconciled = this.#reconciler.reconcile({
      mappedFacts: mappingResult.mappedFacts,
      contextFacts,
    });
    const mappedByPath = new Map(reconciled.map((item) => [item.fact.path, item]));
    const extractionFacts = extraction?.candidate?.facts ?? [];
    const llmByPath = new Map(extractionFacts.map((fact) => [fact.path, fact]));
    const paths = new Set([...mappedByPath.keys(), ...llmByPath.keys()]);
    const decisions = [];

    for (const path of paths) {
      const grounded = mappedByPath.get(path) ?? null;
      const llmFact = llmByPath.get(path) ?? null;
      const candidate = grounded?.fact ?? llmFact;
      if (!candidate) continue;
      const candidateSource = grounded
        ? llmFact ? "evidence_pipeline+llm" : "evidence_pipeline"
        : "llm";
      const evidence = grounded?.evidence ?? emptyEvidence(path);
      const assertion = grounded?.assertion ?? null;
      const contextConflict = grounded?.reconciliation.contextConflict ?? false;
      const verifierRequired = isHighRiskSemanticPath(path);
      const verifier = verifierRequired
        ? await this.#verifier.verify({
            message,
            candidate,
            evidence: evidence.evidence,
            pathway: protocol.code,
          })
        : null;
      const clarification = this.#clarificationManager.create({
        candidate,
        assertion,
        protocol,
        contextConflict: contextConflict && !grounded?.reconciliation.correctionApplied,
      });
      decisions.push(decideSemanticFact({
        candidate,
        candidateSource,
        extractionValid: grounded ? true : extraction?.validationStatus === "valid",
        detectorCandidate: detectorResult.candidates.find((item) => item.factPath === path) ?? null,
        evidence,
        assertion,
        verifier,
        verifierRequired,
        contextConflict,
        reconciliation: grounded?.reconciliation ?? null,
        clarification,
        followUpProposal: followUpFor(protocol, path),
      }));
    }

    return {
      validatorVersion: HYBRID_SEMANTIC_VALIDATOR_VERSION,
      mode: "shadow",
      pathway: protocol.code,
      evidenceSpans: spanResult,
      linguisticAssertions: assertionResult,
      detector: detectorResult,
      conceptMapping: mappingResult,
      reconciliations: reconciled.map((item) => item.reconciliation),
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
  const evidenceSpans = result.evidenceSpans?.spans ?? [];
  const linguisticAssertions = result.linguisticAssertions?.assertions ?? [];
  const mappedFacts = result.conceptMapping?.mappedFacts ?? [];
  const reconciliations = result.reconciliations ?? [];
  return {
    validatorVersion: result.validatorVersion,
    mode: result.mode,
    pathway: result.pathway,
    evidenceSpans: evidenceSpans.map((span) => ({
      spanId: span.spanId,
      start: span.start,
      end: span.end,
      exact: span.exact,
      conceptHints: span.conceptHints.map((hint) => ({
        conceptId: hint.conceptId,
        factPath: hint.factPath,
      })),
    })),
    linguisticAssertions: linguisticAssertions.map((assertion) =>
      sanitizeAssertion(assertion)),
    detectorVersion: result.detector.detectorVersion,
    detectorCandidates: result.detector.candidates.map((item) => ({
      signal: item.signal,
      conceptId: item.conceptId,
      factPath: item.factPath,
      proposedValue: item.proposedValue,
      evidence: item.evidence.map(({ start, end }) => ({ start, end })),
    })),
    mappedFacts: mappedFacts.map((item) => ({
      fact: structuredClone(item.fact),
      assertion: sanitizeAssertion(item.assertion),
      evidenceCount: item.evidence.evidence.length,
      conceptIds: [...item.conceptIds],
    })),
    reconciliations: reconciliations.map(sanitizeReconciliation),
    decisions: result.decisions.map((item) => ({
      factPath: item.factPath,
      decision: item.decision,
      reasonCodes: item.reasonCodes,
      candidate: item.candidate,
      candidateSource: item.candidateSource,
      assertion: item.assertion ? sanitizeAssertion(item.assertion) : null,
      evidenceMethod: item.evidence.method,
      evidenceCount: item.evidence.evidence.length,
      verifierStatus: item.verifier?.status ?? null,
      verifierVerdict: item.verifier?.verdict ?? null,
      verifierErrorCode: item.verifier?.errorCode ?? null,
      reconciliation: item.reconciliation
        ? sanitizeReconciliation(item.reconciliation)
        : null,
      clarification: item.clarification ? {
        factPath: item.clarification.factPath,
        reasonCodes: [...item.clarification.reasonCodes],
        question: item.clarification.question,
      } : null,
      shadowFollowUpProposal: item.shadowFollowUpProposal,
    })),
    summary: result.summary,
    shadowFollowUpProposals: result.shadowFollowUpProposals,
    clinicalStatus: result.clinicalStatus,
  };
}

function sanitizeAssertion(assertion) {
  return {
    assertionId: assertion.assertionId,
    spanId: assertion.spanId,
    evidenceExact: assertion.evidenceExact,
    subject: assertion.subject,
    polarity: assertion.polarity,
    certainty: assertion.certainty,
    temporality: assertion.temporality,
    quote: assertion.quote,
    hypothetical: assertion.hypothetical,
    explicitCorrection: assertion.explicitCorrection,
    evidence: assertion.evidence.map(({ start, end }) => ({ start, end })),
  };
}

function sanitizeReconciliation(reconciliation) {
  return {
    reconcilerVersion: reconciliation.reconcilerVersion,
    status: reconciliation.status,
    contextConflict: reconciliation.contextConflict,
    correctionApplied: reconciliation.correctionApplied,
    previousFact: reconciliation.previousFact,
    currentFactPath: reconciliation.currentFactPath,
    evidence: reconciliation.evidence,
  };
}

function emptyEvidence(factPath) {
  return {
    evidenceVersion: "grounded-evidence-0.1.0",
    factPath,
    support: "none",
    method: "none",
    temporality: "unspecified",
    evidence: [],
  };
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
  return "请确认这项高风险情况是否发生在您本人当前这次症状中。";
}

function summarize(decisions) {
  return Object.fromEntries(Object.values(SemanticGateDecision).map((decision) => [
    decision,
    decisions.filter((item) => item.decision === decision).length,
  ]));
}
