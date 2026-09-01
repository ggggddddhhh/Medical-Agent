import test from "node:test";
import assert from "node:assert/strict";

import { TargetedVerifier, VerifierVerdict } from "../src/index.js";

const request = {
  message: "胸痛，喘不上气。",
  pathway: "CHEST_PAIN_V1",
  candidate: {
    path: "redFlags.difficultyBreathing",
    value: true,
    status: "known",
    temporality: "current",
  },
  evidence: [{ text: "喘不上气", start: 3, end: 7 }],
};

test("TargetedVerifier accepts only SUPPORTED, CONTRADICTED or UNCERTAIN", async (t) => {
  for (const verdict of Object.values(VerifierVerdict)) {
    await t.test(verdict, async () => {
      let providerRequest;
      const verifier = new TargetedVerifier({ provider: provider((args) => {
        providerRequest = args;
        return { verdict };
      }) });
      const result = await verifier.verify(request);
      assert.equal(result.status, "completed");
      assert.equal(result.verdict, verdict);
      assert.equal(providerRequest.schemaName, "targeted_fact_verification");
      assert.deepEqual(providerRequest.jsonSchema.properties.verdict.enum, Object.values(VerifierVerdict));
      assert.doesNotMatch(providerRequest.systemInstruction, /diagnos(?:is|e).*output/i);
    });
  }
});

test("malformed verifier output fails closed to UNCERTAIN", async (t) => {
  for (const output of ["not-json", { verdict: "SUPPORTED", explanation: "extra" }, { verdict: "YES" }]) {
    await t.test(JSON.stringify(output), async () => {
      const result = await new TargetedVerifier({ provider: provider(() => output) }).verify(request);
      assert.equal(result.status, "malformed_response");
      assert.equal(result.verdict, VerifierVerdict.UNCERTAIN);
    });
  }
});

test("verifier timeout and provider failure fail closed", async () => {
  const timeout = await new TargetedVerifier({
    provider: provider(() => new Promise(() => {})),
    timeoutMs: 5,
  }).verify(request);
  assert.equal(timeout.status, "timeout");
  assert.equal(timeout.verdict, VerifierVerdict.UNCERTAIN);

  const failure = await new TargetedVerifier({
    provider: provider(() => { throw Object.assign(new Error("offline"), { code: "OFFLINE" }); }),
  }).verify(request);
  assert.equal(failure.status, "provider_error");
  assert.equal(failure.verdict, VerifierVerdict.UNCERTAIN);
});

function provider(generate) {
  return { name: "DeepSeek", model: "deepseek-v4-flash", generate };
}
