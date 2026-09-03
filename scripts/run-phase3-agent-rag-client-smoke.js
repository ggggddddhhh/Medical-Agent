import assert from "node:assert/strict";

import {
  createPhase2CAgentLoop,
  createPhase3Agent,
  Disposition,
} from "../src/index.js";

const knowledgeServiceUrl = process.env.PYTHON_KNOWLEDGE_SERVICE_URL;
if (!knowledgeServiceUrl) {
  throw new Error("PYTHON_KNOWLEDGE_SERVICE_URL is required.");
}

const transcript = [
  "我头痛",
  "是慢慢出现的",
  "没有",
  "没有",
  "没有",
  "没有",
  "大概 3 分",
];

const unavailableAiFetch = async () => {
  throw new Error("AI extraction intentionally unavailable in integration smoke.");
};
const routedFetch = async (url, options) => {
  if (String(url).startsWith(knowledgeServiceUrl)) {
    return globalThis.fetch(url, options);
  }
  return unavailableAiFetch();
};

const baselineAgent = createPhase2CAgentLoop({ fetchImpl: unavailableAiFetch });
const enrichedAgent = createPhase3Agent({
  fetchImpl: routedFetch,
  pythonKnowledgeServiceUrl: knowledgeServiceUrl,
  knowledgeTimeoutMs: 60_000,
});

const baseline = await runTranscript(baselineAgent);
const enriched = await runTranscript(enrichedAgent);

assert.equal(baseline.decision.disposition, Disposition.SELF_MONITOR);
assert.equal(enriched.decision.disposition, baseline.decision.disposition);
assert.deepEqual(enriched.decision.reasoning, baseline.decision.reasoning);
assert.deepEqual(clinicalState(enriched.state), clinicalState(baseline.state));
assert.equal(enriched.decision.knowledgeSupport.status, "available");
assert.ok(enriched.decision.knowledgeSupport.sources.length > 0);
assert.ok(enriched.decision.knowledgeSupport.snippets.length > 0);

console.log(JSON.stringify({
  status: "passed",
  disposition: enriched.decision.disposition,
  caseStateUnchangedByRag: true,
  sourceIds: enriched.decision.knowledgeSupport.sources.map((item) => item.sourceId),
}));

async function runTranscript(agent) {
  const sessionId = agent.startSession({ adultConfirmed: true });
  let decision;
  for (const message of transcript) {
    decision = await agent.handleMessage(sessionId, message);
  }
  return { decision, state: agent.getSession(sessionId).state };
}

function clinicalState(state) {
  const copy = structuredClone(state);
  delete copy.sessionId;
  return copy;
}
