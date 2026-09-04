import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

import { FactMemory } from "./fact-memory.js";
import { QuestionPlanner } from "./question-planner.js";
import {
  PHASE_52_PLANNER_STATE_VERSION,
  Phase52PlannerState,
} from "./langgraph-planner-state.js";

export const LANGGRAPH_QUESTION_PLANNER_VERSION =
  "phase-5.2-langgraph-question-planner-0.1.0";

export function createLangGraphQuestionPlanner({
  checkpointer = new MemorySaver(),
  factMemory = new FactMemory(),
  questionPlanner = new QuestionPlanner(),
} = {}) {
  const reconcileFactMemory = (state) => ({
    factMemory: factMemory.snapshot(state.caseState),
    plannerStatus: "reconciled",
    traceEvents: [trace(state, "reconcile_fact_memory", "reconciled")],
  });

  const planQuestion = (state) => {
    const planned = questionPlanner.plan({
      caseState: state.caseState,
      pendingClarification: state.pendingClarification,
      factMemory: state.factMemory,
    });
    return {
      plannedQuestion: normalizePlannedQuestion(planned),
      plannerStatus: "planned",
      traceEvents: [trace(
        state,
        "plan_question",
        planned ? "question_selected" : "no_question",
      )],
    };
  };

  const deduplicateQuestion = (state) => {
    const legacy = normalizeLegacyQuestion(
      state.pendingClarification,
      state.legacyDecision,
    );
    const planned = state.plannedQuestion;
    const legacyAnswered = Boolean(
      legacy?.factPath
      && state.factMemory?.answeredFactPaths?.includes(legacy.factPath),
    );

    let comparison;
    let selectedQuestion = legacy;
    let plannerStatus = "matched";
    if (legacy && legacyAnswered) {
      comparison = compare(
        "LEGACY_DUPLICATE",
        legacy,
        planned,
        ["LEGACY_QUESTION_FACT_ALREADY_ANSWERED"],
      );
      selectedQuestion = planned;
      plannerStatus = planned ? "duplicate_replaced" : "comparison_only";
    } else if (!legacy && !planned) {
      comparison = compare("NO_QUESTION", null, null, []);
      selectedQuestion = null;
    } else if (!legacy?.factPath || !planned?.factPath) {
      comparison = compare(
        "INCOMPLETE_MAPPING",
        legacy,
        planned,
        ["QUESTION_FACT_PATH_REQUIRED"],
      );
      plannerStatus = "comparison_only";
    } else if (legacy.id === planned.id && legacy.factPath === planned.factPath) {
      comparison = compare("MATCH", legacy, planned, []);
      selectedQuestion = planned;
    } else {
      comparison = compare(
        "QUESTION_DRIFT",
        legacy,
        planned,
        ["LEGACY_AND_PLANNER_QUESTION_DIFFER"],
      );
      plannerStatus = "comparison_only";
    }

    return {
      selectedQuestion,
      comparison,
      plannerStatus,
      traceEvents: [trace(state, "deduplicate_question", comparison.status)],
    };
  };

  const graph = new StateGraph(Phase52PlannerState)
    .addNode("reconcile_fact_memory", reconcileFactMemory)
    .addNode("plan_question", planQuestion)
    .addNode("deduplicate_question", deduplicateQuestion)
    .addEdge(START, "reconcile_fact_memory")
    .addEdge("reconcile_fact_memory", "plan_question")
    .addEdge("plan_question", "deduplicate_question")
    .addEdge("deduplicate_question", END)
    .compile({ checkpointer });

  return { graph, checkpointer };
}

export function plannerInput({
  sessionId,
  clientTurnId,
  caseState,
  decision,
  pendingClarification,
}) {
  return {
    schemaVersion: PHASE_52_PLANNER_STATE_VERSION,
    sessionId,
    clientTurnId,
    caseState: structuredClone(caseState),
    legacyDecision: safeDecisionProjection(decision),
    pendingClarification: structuredClone(pendingClarification ?? null),
    plannerStatus: "received",
  };
}

function normalizePlannedQuestion(question) {
  if (!question?.id || !question.text) return null;
  return {
    id: question.id,
    factPath: question.factPath ?? null,
    text: question.text,
    source: question.source ?? "question_planner",
  };
}

function normalizeLegacyQuestion(pending, decision) {
  const question = pending?.question ?? decision?.question;
  if (!question?.id || !question.text) return null;
  return {
    id: question.id,
    factPath: pending?.factPath ?? question.factPath ?? null,
    text: question.text,
    source: pending?.source ?? "legacy",
  };
}

function safeDecisionProjection(decision) {
  return structuredClone({
    action: decision?.action ?? null,
    disposition: decision?.disposition ?? null,
    reasonCodes: [...(decision?.reasonCodes ?? [])],
    question: decision?.question ? {
      id: decision.question.id,
      factPath: decision.question.factPath ?? null,
      text: decision.question.text,
    } : null,
    coreDecisionTraceId: decision?.coreDecisionTraceId ?? null,
  });
}

function compare(status, legacy, planned, reasonCodes) {
  return {
    status,
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
