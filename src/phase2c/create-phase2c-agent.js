import { createPhase2BAgentLoop } from "../phase2b/create-phase2b-agent.js";
import { ResponseLayerAgent } from "./response-layer-agent.js";

export function createPhase2CAgentLoop({
  loop,
  responseGenerator,
  responseSafetyGuard,
  ...phase2bOptions
} = {}) {
  return new ResponseLayerAgent({
    loop: loop ?? createPhase2BAgentLoop(phase2bOptions),
    responseGenerator,
    responseSafetyGuard,
  });
}
