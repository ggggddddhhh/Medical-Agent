import { HybridSemanticValidator } from "../semantic/hybrid-semantic-validator.js";
import { SemanticExtractor } from "../semantic/semantic-extractor.js";
import { TargetedVerifier } from "../semantic/targeted-verifier.js";
import { MultiTurnAgentLoop } from "./multi-turn-agent-loop.js";
import { PythonAiServiceProvider } from "./python-ai-service-provider.js";

export function createPhase2BAgentLoop({
  pythonServiceUrl,
  model = "deepseek-v4-flash",
  fetchImpl = globalThis.fetch,
  extractionTimeoutMs = 10_000,
  verifierTimeoutMs = 10_000,
  bridge,
} = {}) {
  const provider = new PythonAiServiceProvider({
    baseUrl: pythonServiceUrl,
    model,
    fetchImpl,
  });
  const extractor = new SemanticExtractor({ provider, timeoutMs: extractionTimeoutMs });
  const verifier = new TargetedVerifier({ provider, timeoutMs: verifierTimeoutMs });
  const hybridValidator = new HybridSemanticValidator({ verifier });
  return new MultiTurnAgentLoop({ extractor, hybridValidator, bridge });
}
