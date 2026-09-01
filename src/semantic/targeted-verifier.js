export const TARGETED_VERIFIER_VERSION = "targeted-verifier-0.1.0";
export const TARGETED_VERIFIER_PROMPT_VERSION = "targeted-verifier-prompt-0.1.0";

export const VerifierVerdict = Object.freeze({
  SUPPORTED: "SUPPORTED",
  CONTRADICTED: "CONTRADICTED",
  UNCERTAIN: "UNCERTAIN",
});

const VERDICTS = Object.freeze(Object.values(VerifierVerdict));

export class TargetedVerifier {
  #provider;
  #timeoutMs;

  constructor({ provider, timeoutMs = 8_000 } = {}) {
    if (!provider || typeof provider.generate !== "function") {
      throw new TypeError("TargetedVerifier requires provider.generate.");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new TypeError("timeoutMs must be a positive integer.");
    }
    this.#provider = provider;
    this.#timeoutMs = timeoutMs;
  }

  get metadata() {
    return {
      verifierVersion: TARGETED_VERIFIER_VERSION,
      verifierPromptVersion: TARGETED_VERIFIER_PROMPT_VERSION,
      modelProvider: this.#provider.name ?? "unknown",
      modelName: this.#provider.model ?? "unknown",
    };
  }

  async verify({ message, candidate, evidence = [], pathway }) {
    const metadata = this.metadata;
    try {
      const output = await withTimeout(
        (signal) => this.#provider.generate({
          message: buildVerifierInput(message, candidate, evidence, pathway),
          systemInstruction: verifierInstruction(),
          jsonSchema: verifierSchema(),
          schemaName: "targeted_fact_verification",
          signal,
        }),
        this.#timeoutMs,
      );
      const normalized = normalizeOutput(output);
      let parsed;
      try {
        parsed = typeof normalized.outputText === "string"
          ? JSON.parse(normalized.outputText)
          : normalized.outputText;
      } catch {
        return failure(metadata, "malformed_response", "INVALID_JSON");
      }
      if (!isStrictVerdict(parsed)) {
        return failure(metadata, "malformed_response", "INVALID_VERIFIER_OUTPUT");
      }
      return {
        ...metadata,
        status: "completed",
        verdict: parsed.verdict,
        errorCode: null,
        providerResponseMetadata: normalized.metadata,
      };
    } catch (error) {
      const timeout = error?.name === "TimeoutError";
      return failure(
        metadata,
        timeout ? "timeout" : "provider_error",
        timeout ? "VERIFIER_TIMEOUT" : error?.code ?? "VERIFIER_PROVIDER_ERROR",
      );
    }
  }
}

export function verifierSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: { verdict: { type: "string", enum: [...VERDICTS] } },
    required: ["verdict"],
  };
}

export function buildVerifierInput(message, candidate, evidence, pathway) {
  return JSON.stringify({
    patientUtterance: message,
    pathway,
    candidateFact: {
      path: candidate?.path ?? null,
      value: candidate?.value ?? null,
      status: candidate?.status ?? null,
      temporality: candidate?.temporality ?? "unspecified",
    },
    evidence: evidence.map((item) => item.text),
    question: "Is this candidate fact directly supported by the patient utterance?",
  });
}

function verifierInstruction() {
  return [
    "You verify exactly one candidate clinical fact against one patient utterance.",
    "Return SUPPORTED only when the exact value, status, and temporality are directly supported.",
    "Return CONTRADICTED when the utterance directly states the opposite.",
    "Return UNCERTAIN for missing, hedged, quoted, hypothetical, other-person, conflicting, or temporally ambiguous support.",
    "Do not infer new facts. Do not output diagnosis, disposition, treatment, medication, tools, or prose.",
  ].join("\n");
}

function normalizeOutput(output) {
  if (output?.type === "semantic_provider_response") {
    return { outputText: output.outputText, metadata: structuredClone(output.metadata ?? {}) };
  }
  return { outputText: output, metadata: {} };
}

function isStrictVerdict(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 1 && VERDICTS.includes(value.verdict);
}

function failure(metadata, status, errorCode) {
  return { ...metadata, status, verdict: VerifierVerdict.UNCERTAIN, errorCode };
}

async function withTimeout(operation, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          const error = new Error("Targeted verification timed out.");
          error.name = "TimeoutError";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
