import { createPhase5Agent } from "../phase5/create-phase5-agent.js";
import { DemoApplication } from "./demo-application.js";

export function createPhase4Demo({ agent, ...phase5Options } = {}) {
  return new DemoApplication({
    agent: agent ?? createPhase5Agent(phase5Options),
  });
}
