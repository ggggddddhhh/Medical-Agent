import { createPhase2BAgentLoop } from "../phase2b/create-phase2b-agent.js";
import { createPhase2CAgentLoop } from "../phase2c/create-phase2c-agent.js";
import { createPhase3Agent } from "../phase3/create-phase3-agent.js";
import { MemoryLayerAgent } from "./memory-layer-agent.js";
import { resolveAgentOrchestratorMode } from "./orchestrator-mode.js";
import { PlannerOrchestratedLoop } from "./planner-orchestrated-loop.js";
import { PlannerPendingBridge } from "./planner-pending-bridge.js";
import { FileSessionManager } from "./session-manager.js";

export function createPhase5Agent({
  agentFactory,
  sessionManager,
  memoryStorageDir,
  factMemory,
  questionPlanner,
  clock,
  orchestratorMode,
  plannerGraph,
  ...phase3Options
} = {}) {
  const mode = resolveAgentOrchestratorMode(orchestratorMode);
  const factory = agentFactory ?? (() => createDefaultAgent({
    mode,
    plannerGraph,
    phase3Options,
  }));
  return new MemoryLayerAgent({
    agentFactory: factory,
    sessionManager: sessionManager ?? new FileSessionManager({ directory: memoryStorageDir }),
    factMemory,
    questionPlanner,
    clock,
  });
}

function createDefaultAgent({ mode, plannerGraph, phase3Options }) {
  if (mode === "legacy") return createPhase3Agent(phase3Options);
  const pendingBridge = new PlannerPendingBridge();
  const legacyLoop = createPhase2BAgentLoop({
    ...phase3Options,
    bridge: pendingBridge,
  });
  const loop = new PlannerOrchestratedLoop({
    loop: legacyLoop,
    mode,
    graph: plannerGraph,
    pendingController: pendingBridge,
  });
  const responseAgent = createPhase2CAgentLoop({
    ...phase3Options,
    loop,
  });
  return createPhase3Agent({
    ...phase3Options,
    agent: responseAgent,
  });
}
