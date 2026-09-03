import { AgentAction, Disposition } from "../domain/constants.js";

export const DEMO_CASE_CATALOG_VERSION = "phase-4-demo-cases-0.1.0";

const CASES = [
  {
    id: "ordinary-headache",
    title: "普通头痛",
    description: "逐步排除现有头痛路径危险信号，完成多轮追问后给出观察建议。",
    context: { adultConfirmed: true },
    messages: [
      "我头痛",
      "是慢慢出现的",
      "没有",
      "没有",
      "没有",
      "没有",
      "大概 3 分",
    ],
    expected: {
      action: AgentAction.DISPOSITION,
      disposition: Disposition.SELF_MONITOR,
      knowledgeStatus: "available",
    },
  },
  {
    id: "ambiguous-chest-pain",
    title: "模糊胸痛",
    description: "胸痛描述不具体，Agent 通过现有路径逐项确认危险信号。",
    context: { adultConfirmed: true },
    messages: [
      "今天胸口痛，但说不清是什么感觉",
      "没有",
      "不是压榨感",
      "没有",
      "没有",
      "现在已经没有了",
    ],
    expected: {
      action: AgentAction.DISPOSITION,
      disposition: Disposition.URGENT_SAME_DAY,
      knowledgeStatus: "available",
    },
  },
  {
    id: "high-risk-chest-pain",
    title: "高风险胸痛",
    description: "胸部压迫感伴呼吸困难，首轮触发现有急救规则并停止普通追问。",
    context: {},
    messages: ["胸口像石头压着一样，喘不上来气"],
    expected: {
      action: AgentAction.SAFETY_ESCALATION,
      disposition: Disposition.EMERGENCY_NOW,
      knowledgeStatus: "not_requested",
    },
  },
];

export const DEMO_CASES = Object.freeze(
  Object.fromEntries(CASES.map((item) => [item.id, deepFreeze(structuredClone(item))])),
);

export function listDemoCases() {
  return Object.values(DEMO_CASES).map((item) => structuredClone(item));
}

export function getDemoCase(caseId) {
  const demoCase = DEMO_CASES[caseId];
  if (!demoCase) {
    const error = new Error("Demo case not found.");
    error.code = "DEMO_CASE_NOT_FOUND";
    throw error;
  }
  return structuredClone(demoCase);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
