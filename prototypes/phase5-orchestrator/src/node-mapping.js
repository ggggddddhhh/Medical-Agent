export const PHASE_51_NODE_MAPPING = Object.freeze([
  Object.freeze({
    node: "capture_turn",
    currentModule: "Legacy Agent public response + CaseState snapshot",
    futureModule: "Input/Resume adapter",
    authority: "orchestration_only",
  }),
  Object.freeze({
    node: "reconcile_fact_memory",
    currentModule: "src/phase5/fact-memory.js",
    futureModule: "Fact Memory projection",
    authority: "derived_from_case_state",
  }),
  Object.freeze({
    node: "plan_question",
    currentModule: "src/phase5/question-planner.js",
    futureModule: "Pre-response Question Planner gate",
    authority: "question_selection_only",
  }),
  Object.freeze({
    node: "compare_legacy",
    currentModule: "Shadow-only comparator",
    futureModule: "Migration telemetry and rollout gate",
    authority: "no_clinical_authority",
  }),
]);

export const PHASE_52_TARGET_NODE_MAPPING = Object.freeze([
  Object.freeze({ node: "accept_input", module: "Demo API adapter", writes: ["clientTurnId", "messageDigest"] }),
  Object.freeze({ node: "semantic_extract", module: "SemanticExtractor", writes: ["extraction"] }),
  Object.freeze({ node: "semantic_gate", module: "HybridSemanticValidator", writes: ["semanticDecisions"] }),
  Object.freeze({ node: "safety_core", module: "CoreSessionBridge + MedicalSafetyAgent", writes: ["caseState", "coreDecision"] }),
  Object.freeze({ node: "reconcile_fact_memory", module: "FactMemory", writes: ["factMemory"] }),
  Object.freeze({ node: "plan_question", module: "QuestionPlanner", writes: ["pendingQuestion", "questionLedger"] }),
  Object.freeze({ node: "clarification_interrupt", module: "LangGraph interrupt/Command", writes: ["resumeBinding"] }),
  Object.freeze({ node: "response_guard", module: "ResponseGenerator + ResponseSafetyGuard", writes: ["response"] }),
  Object.freeze({ node: "knowledge_support", module: "Knowledge policy/client/guard + Python LightRAG", writes: ["knowledgeSupport"] }),
]);
