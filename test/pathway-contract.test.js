import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { protocols } from "../src/protocols/index.js";

test("all pathways expose one uniform Core contract", () => {
  for (const protocol of Object.values(protocols)) {
    assert.equal(typeof protocol.extractDeterministicFacts, "function");
    assert.equal(typeof protocol.determineDisposition, "function");
    assert.equal(typeof protocol.department, "string");
    assert.equal(typeof protocol.warning, "string");
    assert.ok(protocol.semanticFactSchema);
  }
});
test("shared policy and department tool have no symptom-specific branches", () => {
  const policy = readFileSync(new URL("../src/engine/policy-engine.js", import.meta.url), "utf8");
  const tools = readFileSync(new URL("../src/tools/default-tools.js", import.meta.url), "utf8");
  assert.doesNotMatch(policy, /ChiefComplaint\.(HEADACHE|CHEST_PAIN)/);
  assert.doesNotMatch(tools, /chiefComplaint === ["'](headache|chest_pain)["']/);
});
