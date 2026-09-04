import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

import { FactMemory } from "../../../src/phase5/fact-memory.js";
import { QuestionPlanner } from "../../../src/phase5/question-planner.js";
import { PHASE_51_NODE_MAPPING } from "./node-mapping.js";
import { Phase51ShadowState } from "./state-schema.js";

export function createPhase51ShadowGraph({
  checkpointer = new MemorySaver(),
  factMemory = new FactMemory(),
  questionPlanner = new QuestionPlanner(),
} = {}) {
  const captureTurn = (state) => {
    if (state.caseState.sessionId && state.caseState.sessionId !== state.sessionId) {
      throw shadowError("SHADOW_SESSION_ID_DRIFT");
    }
    return {
      shadowStatus: "captured",
      traceEvents: [trace(state, "capture_turn", "captured")],
    };
  };

  const reconcileFactMemory = (state) => ({
    factMemory: factMemory.snapshot(state.caseState),
    shadowStatus: "reconciled",
    traceEvents: [trace(state, "reconcile_fact_memory", "reconciled")],
  });

  const planQuestion = (state) => {
    const planned = questionPlanner.plan({
      caseState: state.caseState,
      pendingClarification: state.pendingClarification,
      factMemory: state.factMemory,
    });
    return {
      plannedQuestion: planned ? {
        id: planned.id,
        factPath: planned.factPath ?? null,
        text: planned.text,
        source: planned.source,
      } : null,
      shadowStatus: "planned",
      traceEvents: [trace(state, "plan_question", planned ? "question_selected" : "no_question")],
    };
  };

  const compareLegacy = (state) => {
    const comparison = compareQuestions(state);
    const diverged = comparison.status !== "MATCH";
    return {
      comparison,
      shadowStatus: diverged ? "diverged" : "matched",
      traceEvents: [trace(state, "compare_legacy", comparison.status)],
    };
  };

  const graph = new StateGraph(Phase51ShadowState)
    .addNode("capture_turn", captureTurn)
    .addNode("reconcile_fact_memory", reconcileFactMemory)
    .addNode("plan_question", planQuestion)
    .addNode("compare_legacy", compareLegacy)
    .addEdge(START, "capture_turn")
    .addEdge("capture_turn", "reconcile_fact_memory")
    .addEdge("reconcile_fact_memory", "plan_question")
    .addEdge("plan_question", "compare_legacy")
    .addEdge("compare_legacy", END)
    .compile({ checkpointer });

  return { graph, checkpointer, nodeMapping: PHASE_51_NODE_MAPPING };
}

function compareQuestions(state) {
  const legacy = legacyQuestion(state.pendingClarification, state.legacyResponse);
  const planned = state.plannedQuestion;
  const answered = Boolean(
    legacy?.factPath && state.factMemory?.answeredFactPaths?.includes(legacy.factPath),
  );

  if (legacy && answered) {
    return comparison("LEGACY_DUPLICATE", legacy, planned, ["LEGACY_QUESTION_FACT_ALREADY_ANSWERED"]);
  }
  if (!legacy && !planned) return comparison("MATCH", null, null, []);
  if (!legacy?.factPath || !planned?.factPath) {
    return comparison("INCOMPLETE_MAPPING", legacy, planned, ["QUESTION_FACT_PATH_REQUIRED"]);
  }
  if (legacy.id === planned.id && legacy.factPath === planned.factPath) {
    return comparison("MATCH", legacy, planned, []);
  }
  return comparison("QUESTION_DRIFT", legacy, planned, ["LEGACY_AND_PLANNER_QUESTION_DIFFER"]);
}

function legacyQuestion(pending, response) {
  const question = pending?.question ?? response?.question;
  if (!question?.id) return null;
  return {
    id: question.id,
    factPath: pending?.factPath ?? question.factPath ?? null,
  };
}

function comparison(status, legacy, planned, reasonCodes) {
  return {
    status,
    blocking: status !== "MATCH",
    legacyQuestionId: legacy?.id ?? null,
    legacyFactPath: legacy?.factPath ?? null,
    plannedQuestionId: planned?.id ?? null,
    plannedFactPath: planned?.factPath ?? null,
    reasonCodes,
  };
}

function trace(state, node, status) {
  return {
    id: `${state.clientTurnId}:${node}`,
    node,
    turn: Number(state.caseState.turnCount ?? 0),
    status,
  };
}

function shadowError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
