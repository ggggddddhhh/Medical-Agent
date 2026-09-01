import {
  createExtractionJsonSchema,
  ExtractionSchemaError,
  SEMANTIC_SCHEMA_VERSION,
  validateExtractionEnvelope,
} from "./extraction-schema.js";

export const SEMANTIC_EXTRACTOR_VERSION = "semantic-shadow-0.1.0";
export const SEMANTIC_PROMPT_VERSION = "semantic-extraction-prompt-0.2.0";

export class SemanticExtractor {
  #provider;
  #timeoutMs;

  constructor({ provider, timeoutMs = 8_000 } = {}) {
    if (!provider || typeof provider.generate !== "function") {
      throw new TypeError("SemanticExtractor requires a provider.generate function.");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new TypeError("timeoutMs must be a positive integer.");
    }
    this.#provider = provider;
    this.#timeoutMs = timeoutMs;
  }

  get metadata() {
    return {
      semanticExtractorVersion: SEMANTIC_EXTRACTOR_VERSION,
      modelProvider: this.#provider.name ?? "unknown",
      modelName: this.#provider.model ?? "unknown",
      baseApiFormat: this.#provider.baseApiFormat ?? "unknown",
      schemaVersion: SEMANTIC_SCHEMA_VERSION,
      promptVersion: SEMANTIC_PROMPT_VERSION,
    };
  }

  async run({ message, protocol, contextFacts = [] }) {
    const metadata = this.metadata;
    try {
      const output = await withTimeout(
        (signal) =>
          this.#provider.generate({
            message,
            pathway: protocol.code,
            systemInstruction: buildExtractionInstruction(protocol, contextFacts),
            jsonSchema: createExtractionJsonSchema(protocol),
            signal,
          }),
        this.#timeoutMs,
      );
      const providerOutput = normalizeProviderOutput(output);
      if (
        providerOutput.outputText === null ||
        providerOutput.outputText === undefined ||
        providerOutput.outputText === ""
      ) {
        return failure(metadata, "empty_response", "not_run", "EMPTY_RESPONSE");
      }
      let candidate;
      try {
        candidate =
          typeof providerOutput.outputText === "string"
            ? JSON.parse(providerOutput.outputText)
            : providerOutput.outputText;
      } catch {
        return failure(metadata, "malformed_response", "invalid", "INVALID_JSON");
      }
      try {
        const validated = validateExtractionEnvelope(candidate, protocol);
        return {
          ...metadata,
          extractionStatus: "completed",
          validationStatus: "valid",
          candidate: validated,
          providerResponseMetadata: providerOutput.metadata,
        };
      } catch (error) {
        if (error instanceof ExtractionSchemaError) {
          return failure(metadata, "completed", "invalid", error.code);
        }
        throw error;
      }
    } catch (error) {
      const timeout = error?.name === "TimeoutError";
      return failure(
        metadata,
        timeout ? "timeout" : classifyProviderFailure(error),
        "not_run",
        timeout ? "LLM_TIMEOUT" : error?.code ?? "PROVIDER_ERROR",
      );
    }
  }
}
export function buildExtractionInstruction(protocol, contextFacts = []) {
  const allowedPaths = Object.keys(protocol.semanticFactSchema).join(", ");
  const instructions = [
    "You are a clinical fact extraction component, not a clinical decision maker.",
    `Extract only facts explicitly supported by the user text for ${protocol.code}.`,
    `Allowed fact paths: ${allowedPaths}.`,
    "Absence of a mention is unknown, never false.",
    "Use known false only for explicit negation; use uncertain for hedged claims.",
    "Preserve temporality and mark correction or disagreement as a contradiction candidate.",
    "Never output diagnosis, differential diagnosis, disposition, actions, escalation, treatment, medication, dose, tool calls, policy instructions, or prose.",
  ];
  if (contextFacts.length > 0) {
    instructions.push(
      `Previously extracted structured facts for conflict comparison: ${JSON.stringify(contextFacts)}`,
    );
  }
  return instructions.join("\n");
}

function normalizeProviderOutput(output) {
  if (output?.type === "semantic_provider_response") {
    return {
      outputText: output.outputText,
      metadata: structuredClone(output.metadata ?? {}),
    };
  }
  return { outputText: output, metadata: {} };
}

function failure(metadata, extractionStatus, validationStatus, errorCode) {
  return {
    ...metadata,
    extractionStatus,
    validationStatus,
    errorCode,
    candidate: null,
  };
}

function classifyProviderFailure(error) {
  if (error?.status === 429 || error?.code === "RATE_LIMIT") {
    return "rate_limited";
  }
  return "provider_error";
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
          const error = new Error("Semantic extraction timed out.");
          error.name = "TimeoutError";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
