import { getProtocol } from "../protocols/index.js";

function requireString(args, key) {
  if (!args || typeof args[key] !== "string" || args[key].length === 0) {
    throw new TypeError(`${key} must be a non-empty string.`);
  }
}

export const clinicalProtocolSearchTool = Object.freeze({
  name: "clinical_protocol_search",
  readOnly: true,
  validate(args) {
    requireString(args, "chiefComplaint");
  },
  execute({ chiefComplaint }) {
    const protocol = getProtocol(chiefComplaint);
    if (!protocol) {
      return { found: false, chiefComplaint };
    }
    return {
      found: true,
      code: protocol.code,
      version: protocol.version,
      displayName: protocol.displayName,
      questionIds: protocol.questions.map((question) => question.id),
    };
  },
});

export const departmentRouterTool = Object.freeze({
  name: "department_router",
  readOnly: true,
  validate(args) {
    requireString(args, "chiefComplaint");
    requireString(args, "disposition");
  },
  execute({ chiefComplaint, disposition }) {
    if (disposition === "EMERGENCY_NOW") {
      return { department: "急诊科", timing: "立即" };
    }
    const protocol = getProtocol(chiefComplaint);
    return {
      department: protocol?.department ?? "全科门诊",
      timing: disposition,
    };
  },
});

export const emergencyResourceTool = Object.freeze({
  name: "emergency_resource",
  readOnly: true,
  validate(args) {
    requireString(args, "region");
  },
  execute({ region }) {
    if (region === "CN") {
      return {
        region,
        emergencyNumber: "120",
        instructions: [
          "立即拨打 120 或前往最近的急诊科。",
          "不要自行驾车；请让身边的人陪同并携带常用药物清单。",
        ],
      };
    }
    return {
      region,
      emergencyNumber: null,
      instructions: [
        "立即联系当地急救服务或前往最近的急诊科。",
        "不要自行驾车；请让身边的人陪同。",
      ],
    };
  },
});
