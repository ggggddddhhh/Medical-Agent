import test from "node:test";
import assert from "node:assert/strict";

import {
  createExtractionJsonSchema,
  ExtractionSchemaError,
  SEMANTIC_SCHEMA_VERSION,
  validateExtractionEnvelope,
} from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";

const protocol = getProtocol("chest_pain");

const fact = (overrides = {}) => ({
  path: "redFlags.difficultyBreathing",
  value: false,
  status: "known",
  confidence: 0.99,
  temporality: "current",
  contradictionCandidate: false,
  ...overrides,
});

const envelope = (facts = [fact()], overrides = {}) => ({
  schemaVersion: SEMANTIC_SCHEMA_VERSION,
  pathway: "CHEST_PAIN_V1",
  facts,
  ...overrides,
});

test("strict extraction schema represents explicit boolean negation", () => {
  const validated = validateExtractionEnvelope(envelope(), protocol);
  assert.equal(validated.facts[0].value, false);
  assert.equal(validated.facts[0].status, "known");
});

test("unmentioned boolean facts remain absent instead of becoming false", () => {
  const validated = validateExtractionEnvelope(
    envelope([fact({ path: "chiefComplaint.code", value: "chest_pain" })]),
    protocol,
  );
  assert.equal(
    validated.facts.some((item) => item.path === "redFlags.difficultyBreathing"),
    false,
  );
});

test("unknown, refused, and uncertain require null rather than forced truth values", () => {
  for (const status of ["unknown", "refused", "uncertain"]) {
    assert.doesNotThrow(() =>
      validateExtractionEnvelope(envelope([fact({ status, value: null })]), protocol),
    );
    assert.throws(
      () => validateExtractionEnvelope(envelope([fact({ status, value: true })]), protocol),
      ExtractionSchemaError,
    );
  }
});

test("conflicting boolean facts preserve both values", () => {
  const validated = validateExtractionEnvelope(
    envelope([
      fact({
        status: "conflicting",
        value: [false, true],
        contradictionCandidate: true,
      }),
    ]),
    protocol,
  );
  assert.deepEqual(validated.facts[0].value, [false, true]);
  assert.throws(
    () =>
      validateExtractionEnvelope(
        envelope([fact({ status: "conflicting", value: [true, true] })]),
        protocol,
      ),
    ExtractionSchemaError,
  );
});

test("temporality distinguishes current, previous, resolved, chronic, and new onset", () => {
  for (const temporality of ["current", "previous", "resolved", "chronic", "new_onset"]) {
    assert.doesNotThrow(() =>
      validateExtractionEnvelope(envelope([fact({ temporality })]), protocol),
    );
  }
});

test("forbidden policy fields and unknown fact paths are rejected", () => {
  assert.throws(
    () => validateExtractionEnvelope(envelope(undefined, { disposition: "SELF_MONITOR" }), protocol),
    ExtractionSchemaError,
  );
  assert.throws(
    () => validateExtractionEnvelope(envelope([fact({ path: "diagnosis" })]), protocol),
    ExtractionSchemaError,
  );
});

test("missing wrapper fields, wrong enums, duplicate paths, and invalid types are rejected", () => {
  const invalid = [
    { pathway: "CHEST_PAIN_V1", facts: [] },
    envelope([fact({ status: "definitely" })]),
    envelope([fact(), fact()]),
    envelope([fact({ path: "symptoms.severity", value: "high" })]),
    envelope([fact({ confidence: 1.1 })]),
  ];
  for (const candidate of invalid) {
    assert.throws(() => validateExtractionEnvelope(candidate, protocol), ExtractionSchemaError);
  }
});

test("generated JSON schema is closed and pathway specific", () => {
  const schema = createExtractionJsonSchema(protocol);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.pathway.const, "CHEST_PAIN_V1");
  assert.equal(schema.properties.facts.items.additionalProperties, false);
  assert.ok(schema.properties.facts.items.properties.path.enum.includes("redFlags.difficultyBreathing"));
  assert.equal(schema.properties.facts.items.properties.path.enum.includes("disposition"), false);
});
