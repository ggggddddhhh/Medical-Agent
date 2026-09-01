export const InputSafetyCode = Object.freeze({
  SELF_HARM: "SELF_HARM_RISK",
  PROMPT_INJECTION: "PROMPT_INJECTION",
  MEDICATION_BOUNDARY: "MEDICATION_BOUNDARY",
  DIAGNOSIS_BOUNDARY: "DIAGNOSIS_BOUNDARY",
});

export function scanInput(text) {
  const normalized = text.toLowerCase();

  if (
    /(不想活|想死|自杀|结束生命|伤害自己|割腕|跳楼|服药自尽|活着没意思|不如死了|想消失|kill myself|suicide)/.test(
      normalized,
    )
  ) {
    return { code: InputSafetyCode.SELF_HARM, severity: "critical" };
  }

  if (
    /(忽略|无视|不要管).*(之前|以上|系统|规则|指令|胸痛规则)|system prompt|developer message|开发者模式|输出.*(系统提示|隐藏规则)|内部隐藏规则|绕过.*安全|把\s*disposition\s*改成|self_monitor/.test(
      normalized,
    )
  ) {
    return { code: InputSafetyCode.PROMPT_INJECTION, severity: "blocked" };
  }

  if (
    /(吃|服用|口服).*(几粒|几片|多少|剂量)|(?:应该|该).*(吃|服用).*(药|布洛芬|对乙酰氨基酚)|停药|停掉|加量|减量|换药|剂量.*(加倍|增加|减少)|告诉我.*处方/.test(
      normalized,
    )
  ) {
    return { code: InputSafetyCode.MEDICATION_BOUNDARY, severity: "boundary" };
  }

  if (/(我是不是得了|我得了什么|帮我诊断|给我确诊|直接诊断|是不是.*(?:偏头痛|心脏病|疾病))/.test(normalized)) {
    return { code: InputSafetyCode.DIAGNOSIS_BOUNDARY, severity: "boundary" };
  }

  return null;
}
