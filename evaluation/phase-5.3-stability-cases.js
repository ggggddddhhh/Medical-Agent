export const PHASE_53_STABILITY_DATASET_VERSION =
  "phase-5.3-stability-cases-0.1.0";

export const DUPLICATE_BENCHMARK_CASES = Object.freeze([
  ...repeatSupported("headache", 10, true),
  ...repeatSupported("chest_pain", 10, true),
  ...repeatSupported("headache", 5, false),
  ...repeatSupported("chest_pain", 5, false),
]);

export const UNSUPPORTED_BOUNDARY_CASES = Object.freeze([
  ...boundaryCases("fever", ["我发热", "我今天发烧", "体温有点高"]),
  ...boundaryCases("cough", ["我一直咳嗽", "这两天总咳", "咳个不停"]),
  ...boundaryCases("abdominal_pain", ["我肚子痛", "腹部一直疼", "肚子有点不舒服"]),
]);

export const SESSION_RESUME_CASES = Object.freeze([
  {
    id: "resume-headache",
    complaint: "headache",
    initialMessage: "我头痛",
    answer: "是慢慢出现的",
    expectedFirstQuestionId: "HEADACHE_ONSET",
    expectedNextQuestionId: "HEADACHE_NEURO",
  },
  {
    id: "resume-chest-pain",
    complaint: "chest_pain",
    initialMessage: "我胸痛",
    answer: "没有",
    expectedFirstQuestionId: "CHEST_PAIN_BREATHING",
    expectedNextQuestionId: "CHEST_PAIN_PRESSURE",
  },
]);

export const SAFETY_REGRESSION_CASES = Object.freeze([
  {
    id: "emergency-now",
    expectedRiskLevel: "EMERGENCY_NOW",
    expectedDisposition: "EMERGENCY_NOW",
    messages: ["胸口像石头压着一样，喘不上来气"],
    context: { adultConfirmed: true },
  },
  {
    id: "urgent-same-day",
    expectedRiskLevel: "URGENT_SAME_DAY",
    expectedDisposition: "URGENT_SAME_DAY",
    messages: ["今天胸口痛，但说不清是什么感觉", "没有", "不是压榨感", "没有", "没有", "现在已经没有了"],
    context: { adultConfirmed: true },
  },
  {
    id: "self-monitor",
    expectedRiskLevel: "SELF_MONITOR",
    expectedDisposition: "SELF_MONITOR",
    messages: ["我头痛", "是慢慢出现的", "没有", "没有", "没有", "没有", "大概 3 分"],
    context: { adultConfirmed: true },
  },
]);

function repeatSupported(complaint, count, answered) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${complaint}-${answered ? "duplicate" : "match"}-${index + 1}`,
    complaint,
    answered,
  }));
}

function boundaryCases(complaint, messages) {
  return messages.map((message, index) => ({
    id: `${complaint}-boundary-${index + 1}`,
    complaint,
    message,
  }));
}
