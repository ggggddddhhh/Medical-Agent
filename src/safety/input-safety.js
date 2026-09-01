export const InputSafetyCode = Object.freeze({
  SELF_HARM: "SELF_HARM_RISK",
  PROMPT_INJECTION: "PROMPT_INJECTION",
  MEDICATION_BOUNDARY: "MEDICATION_BOUNDARY",
});

export function scanInput(text) {
  const normalized = text.toLowerCase();

  if (
    /(不想活|想死|自杀|结束生命|伤害自己|割腕|跳楼|服药自尽|kill myself|suicide)/.test(
      normalized,
    )
  ) {
    return { code: InputSafetyCode.SELF_HARM, severity: "critical" };
  }

  if (
    /(忽略|无视).*(之前|以上|系统|规则|指令)|system prompt|developer message|输出.*(系统提示|隐藏规则)|绕过.*安全/.test(
      normalized,
    )
  ) {
    return { code: InputSafetyCode.PROMPT_INJECTION, severity: "blocked" };
  }

  if (
    /(吃|服用|口服).*(几粒|几片|多少|剂量)|应该.*(吃|服用).*(药|布洛芬|对乙酰氨基酚)|停药|加量|减量|换药/.test(
      normalized,
    )
  ) {
    return { code: InputSafetyCode.MEDICATION_BOUNDARY, severity: "boundary" };
  }

  return null;
}
