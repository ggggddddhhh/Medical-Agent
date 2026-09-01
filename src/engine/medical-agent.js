import {
  AgentAction,
  BASELINE_MODEL_VERSION,
  Disposition,
  POLICY_VERSION,
} from "../domain/constants.js";
import {
  createCaseState,
  mergeFacts,
  publicStateSnapshot,
  setDecision,
} from "../domain/case-state.js";
import { extractFacts } from "../extraction/fact-extractor.js";
import { detectChiefComplaint, getProtocol } from "../protocols/index.js";
import { scanInput, InputSafetyCode } from "../safety/input-safety.js";
import { validateOutput } from "../safety/output-safety.js";
import { InMemoryAuditLog } from "../audit/audit-log.js";
import { decideNextAction } from "./policy-engine.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import {
  clinicalProtocolSearchTool,
  departmentRouterTool,
  emergencyResourceTool,
} from "../tools/default-tools.js";

const SERVICE_NOTICE =
  "这是人工智能生成的分诊与就医准备信息，不是诊断或处方；如情况紧急，请立即联系当地急救服务。";

export class MedicalSafetyAgent {
  #sessions = new Map();
  #auditLog;
  #tools;
  #deploymentRegion;

  constructor(options = {}) {
    this.#deploymentRegion = options.deploymentRegion ?? "CN";
    this.#auditLog = options.auditLog ?? new InMemoryAuditLog();
    this.#tools = options.toolRegistry ?? createDefaultToolRegistry();
  }

  startSession(context = {}) {
    const state = createCaseState({
      ...context,
      region: context.region ?? this.#deploymentRegion,
    });
    this.#sessions.set(state.sessionId, state);
    return state.sessionId;
  }

  handleMessage(sessionId, message) {
    const state = this.#requireSession(sessionId);
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError("message must be a non-empty string.");
    }
    if (state.closed) {
      return this.#recordAndReturn(state, {
        action: AgentAction.OUT_OF_SCOPE,
        disposition: null,
        reasonCodes: ["SESSION_ALREADY_CLOSED"],
        message: "本次评估已经结束。如需评估新的症状，请创建新会话。",
      });
    }

    state.turnCount += 1;
    const inputSafetyResult = scanInput(message);
    if (inputSafetyResult) {
      return this.#handleInputSafety(state, inputSafetyResult);
    }

    if (!state.chiefComplaint.code) {
      const detected = detectChiefComplaint(message);
      if (!detected) {
        return this.#recordAndReturn(state, {
          action: AgentAction.OUT_OF_SCOPE,
          disposition: null,
          reasonCodes: ["UNSUPPORTED_CHIEF_COMPLAINT"],
          message:
            "当前版本仅支持成年人头痛和胸痛的安全评估。该问题暂不在支持范围内，建议咨询医疗专业人员。",
        });
      }
      state.chiefComplaint.code = detected;
      state.chiefComplaint.rawLabel = getProtocol(detected).displayName;
    }

    const protocol = getProtocol(state.chiefComplaint.code);
    mergeFacts(state, extractFacts(message, state, protocol));

    const toolTraces = [];
    if (!state.decisionState.pathwayVersion) {
      const protocolResult = this.#callTool(
        "clinical_protocol_search",
        { chiefComplaint: state.chiefComplaint.code },
        toolTraces,
      );
      if (!protocolResult?.found) {
        return this.#recordAndReturn(
          state,
          {
            action: AgentAction.INSUFFICIENT_INFO,
            disposition: Disposition.INSUFFICIENT_INFORMATION,
            reasonCodes: ["APPROVED_PROTOCOL_UNAVAILABLE"],
            message: "当前无法取得经过审核的症状协议，因此不能安全地继续评估。",
          },
          toolTraces,
        );
      }
      state.decisionState.pathwayVersion = `${protocol.code}@${protocol.version}`;
    }

    const decision = decideNextAction(state, protocol);
    setDecision(state, {
      action: decision.action,
      disposition: decision.disposition,
      reasonCodes: decision.reasonCodes,
      pendingQuestionId: decision.question?.id ?? null,
      pathwayVersion: `${protocol.code}@${protocol.version}`,
    });

    if (
      decision.question &&
      !state.askedQuestionIds.includes(decision.question.id)
    ) {
      state.askedQuestionIds.push(decision.question.id);
    }

    const response = this.#buildDecisionResponse(state, decision, toolTraces);
    if (
      decision.action === AgentAction.DISPOSITION ||
      decision.action === AgentAction.SAFETY_ESCALATION ||
      decision.action === AgentAction.INSUFFICIENT_INFO
    ) {
      state.closed = true;
    }
    return this.#recordAndReturn(state, response, toolTraces);
  }

  getState(sessionId) {
    return publicStateSnapshot(this.#requireSession(sessionId));
  }

  getAudit(sessionId) {
    this.#requireSession(sessionId);
    return this.#auditLog.listForSession(sessionId);
  }

  getServiceNotice() {
    return SERVICE_NOTICE;
  }

  #buildDecisionResponse(state, decision, toolTraces) {
    if (decision.action === AgentAction.ASK_MORE) {
      return {
        action: decision.action,
        disposition: null,
        reasonCodes: decision.reasonCodes,
        message: decision.question.text,
        question: {
          id: decision.question.id,
          text: decision.question.text,
        },
      };
    }

    if (decision.action === AgentAction.SAFETY_ESCALATION) {
      const resource = this.#callTool(
        "emergency_resource",
        { region: state.patientContext.region ?? this.#deploymentRegion },
        toolTraces,
      );
      return {
        action: decision.action,
        disposition: Disposition.EMERGENCY_NOW,
        reasonCodes: decision.reasonCodes,
        message:
          "检测到需要立即处理的危险信号。系统不能判断具体病因，但此时不应继续在线追问。",
        guidance:
          resource?.instructions ?? ["立即联系当地急救服务或前往最近的急诊科。"],
        warnings: ["不要等待症状自行缓解，也不要自行驾车。"],
      };
    }

    if (decision.action === AgentAction.OUT_OF_SCOPE) {
      return {
        action: decision.action,
        disposition: null,
        reasonCodes: decision.reasonCodes,
        message:
          "当前版本仅支持已满 18 周岁的成年人。未成年人请由监护人联系医疗专业人员进行评估。",
      };
    }

    if (decision.action === AgentAction.INSUFFICIENT_INFO) {
      return {
        action: decision.action,
        disposition: Disposition.INSUFFICIENT_INFORMATION,
        reasonCodes: decision.reasonCodes,
        message: "现有信息不足，系统无法安全判断下一步处置，请咨询医疗专业人员。",
      };
    }

    const department =
      decision.disposition === Disposition.SELF_MONITOR
        ? null
        : this.#callTool(
            "department_router",
            {
              chiefComplaint: state.chiefComplaint.code,
              disposition: decision.disposition,
            },
            toolTraces,
          );

    return buildDispositionResponse(decision, department);
  }

  #handleInputSafety(state, result) {
    if (result.code === InputSafetyCode.SELF_HARM) {
      const toolTraces = [];
      const resource = this.#callTool(
        "emergency_resource",
        { region: state.patientContext.region ?? this.#deploymentRegion },
        toolTraces,
      );
      setDecision(state, {
        action: AgentAction.SAFETY_ESCALATION,
        disposition: Disposition.EMERGENCY_NOW,
        reasonCodes: [result.code],
      });
      state.closed = true;
      return this.#recordAndReturn(
        state,
        {
          action: AgentAction.SAFETY_ESCALATION,
          disposition: Disposition.EMERGENCY_NOW,
          reasonCodes: [result.code],
          message:
            "我很重视你现在的安全。如果你可能马上伤害自己，请立即联系急救服务，并尽快告诉身边可信任的人，让对方陪着你。",
          guidance:
            resource?.instructions ?? ["立即联系当地急救服务或前往最近的急诊科。"],
          warnings: ["请远离可能用来自伤的物品，并尽量不要独处。"],
        },
        toolTraces,
      );
    }

    const isMedicationBoundary =
      result.code === InputSafetyCode.MEDICATION_BOUNDARY;
    return this.#recordAndReturn(state, {
      action: AgentAction.OUT_OF_SCOPE,
      disposition: null,
      reasonCodes: [result.code],
      message: isMedicationBoundary
        ? "当前版本不提供个性化用药剂量、停药或换药建议。请咨询医生或药师，并以正式药品说明书为准。"
        : "该请求试图改变或获取系统安全规则，已被拒绝。你仍可以描述头痛或胸痛症状以进行安全评估。",
    });
  }

  #callTool(name, args, traces) {
    const trace = {
      name,
      args: structuredClone(args),
      status: "success",
    };
    try {
      const result = this.#tools.call(name, args);
      trace.result = summarizeToolResult(result);
      traces.push(trace);
      return result;
    } catch (error) {
      trace.status = "failed";
      trace.errorCode = error.name || "TOOL_ERROR";
      traces.push(trace);
      return null;
    }
  }

  #recordAndReturn(state, response, toolTraces = []) {
    const safeResponse = validateOutput({
      sessionId: state.sessionId,
      notice: SERVICE_NOTICE,
      guidance: [],
      warnings: [],
      ...response,
    });
    const actions = [safeResponse.action];
    if (toolTraces.length > 0) {
      actions.splice(Math.max(actions.length - 1, 0), 0, AgentAction.CALL_TOOL);
    }
    const trace = this.#auditLog.append({
      sessionId: state.sessionId,
      supportedPathway: state.decisionState.pathwayVersion,
      state: publicStateSnapshot(state),
      ruleHits: [...(safeResponse.reasonCodes ?? [])],
      actions,
      tools: toolTraces,
      disposition: safeResponse.disposition,
      policyVersion: POLICY_VERSION,
      modelVersion: BASELINE_MODEL_VERSION,
    });
    return {
      ...safeResponse,
      decisionTraceId: trace.traceId,
    };
  }

  #requireSession(sessionId) {
    const state = this.#sessions.get(sessionId);
    if (!state) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return state;
  }
}

function buildDispositionResponse(decision, department) {
  if (decision.disposition === Disposition.URGENT_SAME_DAY) {
    return {
      action: AgentAction.DISPOSITION,
      disposition: decision.disposition,
      reasonCodes: decision.reasonCodes,
      message: "根据目前信息，建议当天由医疗专业人员进行评估。",
      guidance: department
        ? [`建议就诊：${department.department}。`]
        : ["请联系当地医疗机构安排当天评估。"],
      warnings: ["如果症状加重或出现新的危险信号，请立即联系急救服务。"],
    };
  }
  if (decision.disposition === Disposition.CLINIC_SOON) {
    return {
      action: AgentAction.DISPOSITION,
      disposition: decision.disposition,
      reasonCodes: decision.reasonCodes,
      message: "目前未触发本路径的紧急信号，建议近期安排门诊评估。",
      guidance: department
        ? [`建议就诊：${department.department}。`]
        : ["请联系当地医疗机构安排门诊评估。"],
      warnings: ["如出现突然剧烈头痛、肢体无力、说话不清、意识异常或症状明显加重，请立即就医。"],
    };
  }
  return {
    action: AgentAction.DISPOSITION,
    disposition: Disposition.SELF_MONITOR,
    reasonCodes: decision.reasonCodes,
    message: "目前未触发本路径的危险信号，可暂时观察症状变化。",
    guidance: ["注意休息并记录症状变化；若持续不缓解，请安排门诊评估。"],
    warnings: ["如出现突然剧烈头痛、肢体无力、说话不清、意识异常或症状明显加重，请立即就医。"],
  };
}

function summarizeToolResult(result) {
  if (!result || typeof result !== "object") {
    return result;
  }
  const allowedKeys = [
    "found",
    "code",
    "version",
    "displayName",
    "department",
    "timing",
    "region",
    "emergencyNumber",
  ];
  return Object.fromEntries(
    Object.entries(result).filter(([key]) => allowedKeys.includes(key)),
  );
}

function createDefaultToolRegistry() {
  return new ToolRegistry()
    .register(clinicalProtocolSearchTool)
    .register(departmentRouterTool)
    .register(emergencyResourceTool);
}
