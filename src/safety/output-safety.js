const FORBIDDEN_TEXT_PATTERNS = [
  /你(已经|就是|肯定)?(患有|得了)/,
  /你(?:肯定|一定|绝对)?是(?:偏头痛|心脏病|脑卒中|中风)/,
  /可以确诊/,
  /保证(没事|安全|不会)/,
  /绝对没问题|肯定没问题|一定没事/,
  /不用就医/,
  /(?:服用|吃)\s*\d+(?:\.\d+)?\s*(?:mg|毫克|片|粒)/i,
];

export class OutputSafetyError extends Error {
  constructor(code) {
    super(`Output safety policy rejected response: ${code}`);
    this.name = "OutputSafetyError";
    this.code = code;
  }
}

export function validateOutput(response) {
  const allText = [
    response.message,
    ...(response.guidance ?? []),
    ...(response.warnings ?? []),
  ].join(" ");

  for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
    if (pattern.test(allText)) {
      throw new OutputSafetyError("PROHIBITED_MEDICAL_CLAIM");
    }
  }

  if (response.disposition === "EMERGENCY_NOW") {
    if (response.action !== "SAFETY_ESCALATION") {
      throw new OutputSafetyError("EMERGENCY_ACTION_MISMATCH");
    }
    if (!response.guidance?.some((item) => /急救|急诊|120/.test(item))) {
      throw new OutputSafetyError("EMERGENCY_WITHOUT_ACTION");
    }
    if (/观察|等等看|休息看看|在家休息|先看看/.test(allText)) {
      throw new OutputSafetyError("EMERGENCY_CONTRADICTORY_ADVICE");
    }
  }

  if (/(附近|周边).{0,20}医院|医院.*(有号|可预约|正在接诊)/.test(allText)) {
    throw new OutputSafetyError("UNVERIFIED_FACILITY_CLAIM");
  }

  return response;
}
