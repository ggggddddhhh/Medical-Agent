import { createPhase3Agent } from "../phase3/create-phase3-agent.js";
import { DemoApplication } from "./demo-application.js";

export function createPhase4Demo({ agent, ...phase3Options } = {}) {
  return new DemoApplication({
    agent: agent ?? createPhase3Agent(phase3Options),
  });
}
