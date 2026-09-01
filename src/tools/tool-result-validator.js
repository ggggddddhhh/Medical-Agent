const SAFE_DEPARTMENTS = new Set([
  "急诊科",
  "神经内科或全科门诊",
  "急诊科或心血管内科",
  "全科门诊",
]);

const MALICIOUS_TOOL_TEXT =
  /(忽略.*规则|system prompt|developer message|self_monitor|在家观察|不用就医|有急诊号|可预约|处方|剂量)/i;

export class ToolResultValidationError extends Error {
  constructor(code) {
    super(`Tool result validation failed: ${code}`);
    this.name = "ToolResultValidationError";
    this.code = code;
  }
}

export function validateToolResult(name, result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new ToolResultValidationError("RESULT_NOT_OBJECT");
  }
  assertNoMaliciousText(result);

  if (name === "clinical_protocol_search") {
    return validateProtocolResult(result);
  }
  if (name === "department_router") {
    return validateDepartmentResult(result);
  }
  if (name === "emergency_resource") {
    return validateEmergencyResult(result);
  }
  throw new ToolResultValidationError("UNKNOWN_TOOL_RESULT_SCHEMA");
}

function validateProtocolResult(result) {
  assertExactKeys(
    result,
    result.found
      ? ["found", "code", "version", "displayName", "questionIds"]
      : ["found", "chiefComplaint"],
  );
  if (typeof result.found !== "boolean") {
    throw new ToolResultValidationError("PROTOCOL_FOUND_NOT_BOOLEAN");
  }
  if (result.found) {
    for (const key of ["code", "version", "displayName"]) {
      assertNonEmptyString(result[key], `PROTOCOL_${key.toUpperCase()}_INVALID`);
    }
    if (
      !Array.isArray(result.questionIds) ||
      result.questionIds.length === 0 ||
      !result.questionIds.every((item) => typeof item === "string" && item.length > 0)
    ) {
      throw new ToolResultValidationError("PROTOCOL_QUESTION_IDS_INVALID");
    }
  } else {
    assertNonEmptyString(result.chiefComplaint, "PROTOCOL_COMPLAINT_INVALID");
  }
  return structuredClone(result);
}

function validateDepartmentResult(result) {
  assertExactKeys(result, ["department", "timing"]);
  if (!SAFE_DEPARTMENTS.has(result.department)) {
    throw new ToolResultValidationError("DEPARTMENT_NOT_ALLOWLISTED");
  }
  assertNonEmptyString(result.timing, "DEPARTMENT_TIMING_INVALID");
  return structuredClone(result);
}

function validateEmergencyResult(result) {
  assertExactKeys(result, ["region", "emergencyNumber", "instructions"]);
  assertNonEmptyString(result.region, "EMERGENCY_REGION_INVALID");
  if (
    result.emergencyNumber !== null &&
    (typeof result.emergencyNumber !== "string" ||
      result.emergencyNumber.length === 0)
  ) {
    throw new ToolResultValidationError("EMERGENCY_NUMBER_INVALID");
  }
  if (
    !Array.isArray(result.instructions) ||
    result.instructions.length === 0 ||
    !result.instructions.every((item) => typeof item === "string" && item.length > 0)
  ) {
    throw new ToolResultValidationError("EMERGENCY_INSTRUCTIONS_INVALID");
  }
  return structuredClone(result);
}

function assertExactKeys(result, expected) {
  const actual = Object.keys(result).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new ToolResultValidationError("UNEXPECTED_RESULT_FIELDS");
  }
}

function assertNonEmptyString(value, code) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ToolResultValidationError(code);
  }
}

function assertNoMaliciousText(value) {
  const strings = collectStrings(value);
  if (strings.some((item) => MALICIOUS_TOOL_TEXT.test(item))) {
    throw new ToolResultValidationError("MALICIOUS_TOOL_TEXT");
  }
}

function collectStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}
