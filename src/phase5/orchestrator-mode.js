export const AGENT_ORCHESTRATOR_MODES = Object.freeze([
  "legacy",
  "shadow",
  "langgraph",
]);

export const DEFAULT_AGENT_ORCHESTRATOR_MODE = "langgraph";

export function resolveAgentOrchestratorMode(
  value = process.env.AGENT_ORCHESTRATOR ?? DEFAULT_AGENT_ORCHESTRATOR_MODE,
) {
  const mode = String(value).trim().toLowerCase();
  if (!AGENT_ORCHESTRATOR_MODES.includes(mode)) {
    const error = new TypeError(
      `AGENT_ORCHESTRATOR must be one of: ${AGENT_ORCHESTRATOR_MODES.join(", ")}.`,
    );
    error.code = "INVALID_AGENT_ORCHESTRATOR_MODE";
    throw error;
  }
  return mode;
}
