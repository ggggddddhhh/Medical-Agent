import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const PHASE_52_PLANNER_STATE_VERSION = "phase-5.2-planner-state-0.1.0";

const JsonObject = z.record(z.string(), z.unknown());
const Question = z.object({
  id: z.string().min(1),
  factPath: z.string().nullable(),
  text: z.string().min(1),
  source: z.string().min(1),
}).nullable();
const Comparison = z.object({
  status: z.enum([
    "MATCH",
    "LEGACY_DUPLICATE",
    "QUESTION_DRIFT",
    "INCOMPLETE_MAPPING",
    "NO_QUESTION",
  ]),
  legacyQuestionId: z.string().nullable(),
  legacyFactPath: z.string().nullable(),
  plannedQuestionId: z.string().nullable(),
  plannedFactPath: z.string().nullable(),
  reasonCodes: z.array(z.string()),
});
const TraceEvent = z.object({
  id: z.string(),
  node: z.string(),
  turn: z.number().int().nonnegative(),
  status: z.string(),
});

export const Phase52PlannerState = new StateSchema({
  schemaVersion: z.literal(PHASE_52_PLANNER_STATE_VERSION),
  sessionId: z.string().min(1),
  clientTurnId: z.string().min(1),
  caseState: JsonObject,
  legacyDecision: JsonObject,
  pendingClarification: JsonObject.nullable(),
  factMemory: JsonObject.nullable().default(null),
  plannedQuestion: Question.default(null),
  selectedQuestion: Question.default(null),
  comparison: Comparison.default(() => ({
    status: "NO_QUESTION",
    legacyQuestionId: null,
    legacyFactPath: null,
    plannedQuestionId: null,
    plannedFactPath: null,
    reasonCodes: [],
  })),
  plannerStatus: z.enum([
    "received",
    "reconciled",
    "planned",
    "matched",
    "duplicate_replaced",
    "comparison_only",
  ]).default("received"),
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
