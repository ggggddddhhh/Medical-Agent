export const CONVERSATION_RECONCILER_VERSION = "conversation-reconciler-0.1.0";

export class ConversationReconciler {
  reconcile({ mappedFacts, contextFacts = [] }) {
    if (!Array.isArray(mappedFacts) || !Array.isArray(contextFacts)) {
      throw new TypeError("ConversationReconciler requires mappedFacts and contextFacts arrays.");
    }
    return mappedFacts.map((mapped) => {
      const previous = [...contextFacts].reverse().find((item) =>
        item.path === mapped.fact.path && item.status === "known");
      const changed = Boolean(previous && mapped.fact.status === "known" &&
        JSON.stringify(previous.value) !== JSON.stringify(mapped.fact.value));
      const correctionApplied = Boolean(
        changed &&
        mapped.assertion.explicitCorrection &&
        mapped.assertion.evidenceExact &&
        mapped.assertion.subject === "patient" &&
        !mapped.assertion.quote &&
        !mapped.assertion.hypothetical
      );
      return {
        ...mapped,
        fact: correctionApplied
          ? { ...mapped.fact, contradictionCandidate: true }
          : mapped.fact,
        reconciliation: {
          reconcilerVersion: CONVERSATION_RECONCILER_VERSION,
          status: correctionApplied
            ? "CORRECTION_APPLIED"
            : changed
              ? "CONFLICT_REQUIRES_CLARIFICATION"
              : "NO_CONFLICT",
          contextConflict: changed,
          correctionApplied,
          previousFact: previous ? structuredClone(previous) : null,
          currentFactPath: mapped.fact.path,
          evidence: mapped.evidence.evidence.map(({ start, end }) => ({ start, end })),
        },
      };
    });
  }
}
