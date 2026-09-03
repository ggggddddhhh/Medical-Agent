import { createPhase2CAgentLoop } from "../phase2c/create-phase2c-agent.js";
import { KnowledgeEnrichedAgent } from "./knowledge-enriched-agent.js";
import { PythonKnowledgeServiceClient } from "./python-knowledge-service-client.js";

export function createPhase3Agent({
  agent,
  knowledgeClient,
  pythonKnowledgeServiceUrl,
  knowledgeTimeoutMs,
  fetchImpl = globalThis.fetch,
  ...phase2cOptions
} = {}) {
  return new KnowledgeEnrichedAgent({
    agent: agent ?? createPhase2CAgentLoop(phase2cOptions),
    knowledgeClient: knowledgeClient ?? new PythonKnowledgeServiceClient({
      baseUrl: pythonKnowledgeServiceUrl,
      fetchImpl,
      timeoutMs: knowledgeTimeoutMs,
    }),
  });
}
