const FORBIDDEN_TEXT_PATTERNS = [
  /你(已经|就是|肯定)?(患有|得了)/,
  /可以确诊/,
  /保证(没事|安全|不会)/,
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
    if (!response.guidance?.some((item) => /急救|急诊|120/.test(item))) {
      throw new OutputSafetyError("EMERGENCY_WITHOUT_ACTION");
    }
    if (/观察|等等看/.test(allText)) {
      throw new OutputSafetyError("EMERGENCY_CONTRADICTORY_ADVICE");
    }
  }

  return response;
}
