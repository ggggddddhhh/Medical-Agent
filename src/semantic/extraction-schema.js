export const SEMANTIC_SCHEMA_VERSION = "clinical-facts-1.0.0";

export const SemanticFactStatus = Object.freeze({
  KNOWN: "known",
  UNKNOWN: "unknown",
  REFUSED: "refused",
  UNCERTAIN: "uncertain",
  CONFLICTING: "conflicting",
});

export const FactTemporality = Object.freeze({
  CURRENT: "current",
  PREVIOUS: "previous",
  RESOLVED: "resolved",
  CHRONIC: "chronic",
  NEW_ONSET: "new_onset",
  UNSPECIFIED: "unspecified",
});

const STATUS_VALUES = Object.freeze(Object.values(SemanticFactStatus));
const TEMPORALITY_VALUES = Object.freeze(Object.values(FactTemporality));
const TOP_LEVEL_KEYS = Object.freeze(["schemaVersion", "pathway", "facts"]);
const FACT_KEYS = Object.freeze([
  "path",
  "value",
  "status",
  "confidence",
  "temporality",
  "contradictionCandidate",
]);

export class ExtractionSchemaError extends Error {
  constructor(message, code = "EXTRACTION_SCHEMA_VIOLATION") {
    super(message);
    this.name = "ExtractionSchemaError";
    this.code = code;
  }
}

export function createExtractionJsonSchema(protocol) {
  requireProtocolSchema(protocol);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", const: SEMANTIC_SCHEMA_VERSION },
      pathway: { type: "string", const: protocol.code },
      facts: {
        type: "array",
        maxItems: Object.keys(protocol.semanticFactSchema).length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: {
              type: "string",
              enum: Object.keys(protocol.semanticFactSchema),
            },
            value: {
              anyOf: [
                { type: "boolean" },
                { type: "number" },
                { type: "string" },
                {
                  type: "array",
                  minItems: 2,
                  uniqueItems: true,
                  items: {
                    anyOf: [
                      { type: "boolean" },
                      { type: "number" },
                      { type: "string" },
                    ],
                  },
                },
                { type: "null" },
              ],
            },
            status: { type: "string", enum: STATUS_VALUES },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            temporality: { type: "string", enum: TEMPORALITY_VALUES },
            contradictionCandidate: { type: "boolean" },
          },
          required: FACT_KEYS,
        },
      },
    },
    required: TOP_LEVEL_KEYS,
  };
}

export function validateExtractionEnvelope(candidate, protocol) {
  requireProtocolSchema(protocol);
  requirePlainObject(candidate, "Extraction output must be an object.");
  requireExactKeys(candidate, TOP_LEVEL_KEYS, "extraction wrapper");
  if (candidate.schemaVersion !== SEMANTIC_SCHEMA_VERSION) {
    throw new ExtractionSchemaError("Unsupported semantic schemaVersion.");
  }
  if (candidate.pathway !== protocol.code) {
    throw new ExtractionSchemaError("Extraction pathway does not match protocol.");
  }
  if (!Array.isArray(candidate.facts)) {
    throw new ExtractionSchemaError("facts must be an array.");
  }
  if (candidate.facts.length > Object.keys(protocol.semanticFactSchema).length) {
    throw new ExtractionSchemaError("facts exceeds the pathway field limit.");
  }

  const seenPaths = new Set();
  for (const fact of candidate.facts) {
    requirePlainObject(fact, "Each fact must be an object.");
    requireExactKeys(fact, FACT_KEYS, "fact");
    const definition = protocol.semanticFactSchema[fact.path];
    if (!definition) {
      throw new ExtractionSchemaError(`Fact path is not allowed: ${fact.path}`);
    }
    if (seenPaths.has(fact.path)) {
      throw new ExtractionSchemaError(`Duplicate fact path: ${fact.path}`);
    }
    seenPaths.add(fact.path);
    if (!STATUS_VALUES.includes(fact.status)) {
      throw new ExtractionSchemaError(`Invalid fact status: ${fact.status}`);
    }
    if (
      typeof fact.confidence !== "number" ||
      !Number.isFinite(fact.confidence) ||
      fact.confidence < 0 ||
      fact.confidence > 1
    ) {
      throw new ExtractionSchemaError("confidence must be between 0 and 1.");
    }
    if (!TEMPORALITY_VALUES.includes(fact.temporality)) {
      throw new ExtractionSchemaError(`Invalid temporality: ${fact.temporality}`);
    }
    if (typeof fact.contradictionCandidate !== "boolean") {
      throw new ExtractionSchemaError("contradictionCandidate must be boolean.");
    }
    validateFactValue(fact, definition);
  }
  return structuredClone(candidate);
}

function validateFactValue(fact, definition) {
  if (["unknown", "refused", "uncertain"].includes(fact.status)) {
    if (fact.value !== null) {
      throw new ExtractionSchemaError(`${fact.status} facts must use null value.`);
    }
    return;
  }
  const values = fact.status === "conflicting" ? fact.value : [fact.value];
  if (fact.status === "conflicting" && (!Array.isArray(values) || values.length < 2)) {
    throw new ExtractionSchemaError("conflicting facts need at least two values.");
  }
  if (
    fact.status === "conflicting" &&
    new Set(values.map((value) => JSON.stringify(value))).size !== values.length
  ) {
    throw new ExtractionSchemaError("conflicting facts need distinct values.");
  }
  for (const value of values) {
    if (!matchesDefinition(value, definition)) {
      throw new ExtractionSchemaError(`Invalid value for fact path: ${fact.path}`);
    }
  }
}

function matchesDefinition(value, definition) {
  if (definition.type === "boolean") {
    return typeof value === "boolean";
  }
  if (definition.type === "enum") {
    return typeof value === "string" && definition.values.includes(value);
  }
  if (definition.type === "integer" && !Number.isInteger(value)) {
    return false;
  }
  if (definition.type === "number" || definition.type === "integer") {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (definition.minimum === undefined || value >= definition.minimum) &&
      (definition.maximum === undefined || value <= definition.maximum)
    );
  }
  return false;
}

function requireProtocolSchema(protocol) {
  if (!protocol?.code || !protocol.semanticFactSchema) {
    throw new TypeError("A protocol with semanticFactSchema is required.");
  }
}

function requirePlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExtractionSchemaError(message);
  }
}

function requireExactKeys(value, expectedKeys, label) {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new ExtractionSchemaError(`${label} contains missing or forbidden fields.`);
  }
}
