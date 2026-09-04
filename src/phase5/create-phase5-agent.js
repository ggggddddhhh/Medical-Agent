import { createPhase3Agent } from "../phase3/create-phase3-agent.js";
import { MemoryLayerAgent } from "./memory-layer-agent.js";
import { FileSessionManager } from "./session-manager.js";

export function createPhase5Agent({
  agentFactory,
  sessionManager,
  memoryStorageDir,
  factMemory,
  questionPlanner,
  clock,
  ...phase3Options
} = {}) {
  const factory = agentFactory ?? (() => createPhase3Agent(phase3Options));
  return new MemoryLayerAgent({
    agentFactory: factory,
    sessionManager: sessionManager ?? new FileSessionManager({ directory: memoryStorageDir }),
    factMemory,
    questionPlanner,
    clock,
  });
}
