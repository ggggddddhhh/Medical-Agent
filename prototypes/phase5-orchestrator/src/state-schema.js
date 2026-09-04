import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const PHASE_51_GRAPH_STATE_VERSION = "phase-5.1-shadow-state-0.1.0";

const JsonObject = z.record(z.string(), z.unknown());
const PlannedQuestion = z.object({
  id: z.string(),
  factPath: z.string().nullable(),
  text: z.string(),
  source: z.string(),
}).nullable();
const Comparison = z.object({
  status: z.enum(["MATCH", "LEGACY_DUPLICATE", "QUESTION_DRIFT", "INCOMPLETE_MAPPING"]),
  blocking: z.boolean(),
  legacyQuestionId: z.string().nullable(),
  legacyFactPath: z.string().nullable(),
  plannedQuestionId: z.string().nullable(),
  plannedFactPath: z.string().nullable(),
  reasonCodes: z.array(z.string()),
}).nullable();
const TraceEvent = z.object({
  id: z.string(),
  node: z.string(),
  turn: z.number().int().nonnegative(),
  status: z.string(),
});

export const Phase51ShadowState = new StateSchema({
  schemaVersion: z.literal(PHASE_51_GRAPH_STATE_VERSION),
  sessionId: z.string().min(1),
  clientTurnId: z.string().min(1),
  messageDigest: z.string().regex(/^[a-f0-9]{64}$/),
  caseState: JsonObject,
  legacyResponse: JsonObject,
  pendingClarification: JsonObject.nullable(),
  factMemory: JsonObject.nullable().default(null),
  plannedQuestion: PlannedQuestion.default(null),
  comparison: Comparison.default(null),
  shadowStatus: z.enum(["captured", "reconciled", "planned", "matched", "diverged"]).default("captured"),
  traceEvents: new ReducedValue(
    z.array(TraceEvent).default(() => []),
    { reducer: mergeTraceEvents },
  ),
});

function mergeTraceEvents(current, update) {
  const byId = new Map();
  for (const event of [...current, ...update]) byId.set(event.id, event);
  return [...byId.values()];
}
