import { getProtocol } from "../protocols/index.js";

export const QUESTION_PLANNER_VERSION = "phase-5-question-planner-0.1.0";

const ADULT_QUESTION = Object.freeze({
  id: "CONFIRM_ADULT",
  factPath: "patientContext.adultConfirmed",
  text: "当前版本仅支持成年人。请确认患者是否已满 18 周岁？",
});

export class QuestionPlanner {
  plan({ caseState, pendingClarification = null, factMemory }) {
    if (!caseState || !factMemory) {
      throw new TypeError("QuestionPlanner requires CaseState and FactMemory.");
    }
    if (caseState.closed) return null;

    const pending = normalizePending(pendingClarification);
    if (pending && !isAnswered(factMemory, pending.factPath)) {
      return { ...pending, source: pendingClarification.source ?? "pending" };
    }
    if (!isAnswered(factMemory, ADULT_QUESTION.factPath)) {
      return { ...ADULT_QUESTION, source: "safety_core" };
    }

    const complaint = caseState.chiefComplaint?.code;
    if (!complaint) return null;
    const protocol = getProtocol(complaint);
    const next = protocol?.questions?.find((question) =>
      !isAnswered(factMemory, question.factPath));
    return next ? {
      id: next.id,
      factPath: next.factPath,
      text: next.text,
      source: "clinical_pathway",
    } : null;
  }

  observe({ response, caseState, factMemory, questionMemory = { questions: [] } }) {
    const current = normalizeResponseQuestion(response);
    const questions = [...(questionMemory.questions ?? [])].map((item) => structuredClone(item));
    let duplicateQuestionFiltered = false;
    if (current) {
      const existing = questions.find((item) => item.id === current.id);
      if (existing) {
        existing.timesAsked += 1;
        existing.lastAskedTurn = caseState.turnCount;
      } else {
        questions.push({
          ...current,
          timesAsked: 1,
          firstAskedTurn: caseState.turnCount,
          lastAskedTurn: caseState.turnCount,
        });
      }
      duplicateQuestionFiltered = isAnswered(factMemory, current.factPath);
    }
    for (const item of questions) {
      item.status = isAnswered(factMemory, item.factPath) ? "answered" : "pending";
    }
    const nextQuestion = this.plan({
      caseState,
      pendingClarification: response?.pendingClarification,
      factMemory,
    });
    return {
      version: QUESTION_PLANNER_VERSION,
      questions,
      nextQuestion,
      duplicateQuestionFiltered,
    };
  }
}

function isAnswered(factMemory, factPath) {
  return Boolean(factPath && factMemory.answeredFactPaths?.includes(factPath));
}

function normalizePending(pending) {
  if (!pending?.question?.id || !pending.question.text) return null;
  return {
    id: pending.question.id,
    factPath: pending.factPath ?? pending.question.factPath ?? null,
    text: pending.question.text,
  };
}

function normalizeResponseQuestion(response) {
  const pending = normalizePending(response?.pendingClarification);
  if (pending) return pending;
  if (!response?.question?.id || !response.question.text) return null;
  return {
    id: response.question.id,
    factPath: response.question.factPath ?? null,
    text: response.question.text,
  };
}
