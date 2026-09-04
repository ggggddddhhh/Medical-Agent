export const FACT_MEMORY_VERSION = "phase-5-fact-memory-0.1.0";

export class FactMemory {
  snapshot(caseState) {
    if (!caseState?.factMetadata || typeof caseState.factMetadata !== "object") {
      throw new TypeError("FactMemory requires a CaseState snapshot.");
    }
    const confirmedFacts = [];
    const answeredFactPaths = [];
    for (const [path, metadata] of Object.entries(caseState.factMetadata)) {
      if (["known", "refused"].includes(metadata?.status)) {
        answeredFactPaths.push(path);
      }
      if (metadata?.status === "known") {
        confirmedFacts.push({
          path,
          value: structuredClone(metadata.value),
          status: metadata.status,
          updatedAtTurn: metadata.updatedAtTurn ?? null,
        });
      }
    }
    if (caseState.chiefComplaint?.code) {
      const path = "chiefComplaint.code";
      if (!answeredFactPaths.includes(path)) answeredFactPaths.push(path);
      if (!confirmedFacts.some((item) => item.path === path)) {
        confirmedFacts.push({
          path,
          value: caseState.chiefComplaint.code,
          status: "known",
          updatedAtTurn: null,
        });
      }
    }
    return {
      version: FACT_MEMORY_VERSION,
      confirmedFacts: confirmedFacts.sort((left, right) => left.path.localeCompare(right.path)),
      answeredFactPaths: [...new Set(answeredFactPaths)].sort(),
    };
  }

  isAnswered(snapshot, factPath) {
    return Boolean(factPath && snapshot?.answeredFactPaths?.includes(factPath));
  }
}
