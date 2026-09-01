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
  restoreCaseState,
  serializeCaseState,
  setDecision,
} from "../domain/case-state.js";
import { extractFacts } from "../extraction/fact-extractor.js";
import { detectChiefComplaint, getProtocol } from "../protocols/index.js";
import { scanInput, InputSafetyCode } from "../safety/input-safety.js";
import { validateOutput } from "../safety/output-safety.js";
import { InMemoryAuditLog } from "../audit/audit-log.js";
import { decideNextAction } from "./policy-engine.js";
import {
  assertActionTransition,
  isTerminalAction,
} from "./state-machine.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import {
  clinicalProtocolSearchTool,
  departmentRouterTool,
  emergencyResourceTool,
} from "../tools/default-tools.js";
import { validateToolResult } from "../tools/tool-result-validator.js";

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

  restoreSession(serializedState) {
    const state = restoreCaseState(serializedState);
    if (this.#sessions.has(state.sessionId)) {
      throw new Error(`Session already exists: ${state.sessionId}`);
    }
    this.#sessions.set(state.sessionId, state);
    return state.sessionId;
  }

  exportSession(sessionId) {
    return serializeCaseState(this.#requireSession(sessionId));
  }

  handleMessage(sessionId, message) {
    const state = this.#requireSession(sessionId);
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError("message must be a non-empty string.");
    }
    state.turnCount += 1;
    const inputSafetyResult = scanInput(message);
    if (inputSafetyResult?.code === InputSafetyCode.SELF_HARM) {
      return this.#handleInputSafety(state, inputSafetyResult);
    }

    const emergencyProbe = this.#probeEmergency(state, message);
    if (state.closed) {
      if (
        state.decisionState.action === AgentAction.SAFETY_ESCALATION ||
        state.decisionState.disposition === Disposition.EMERGENCY_NOW
      ) {
        return this.#handleClosedSession(state);
      }
      if (emergencyProbe.ruleHits.length > 0) {
        return this.#handleEmergencyProbe(state, emergencyProbe);
      }
      return this.#handleClosedSession(state);
    }
    if (inputSafetyResult && emergencyProbe.ruleHits.length === 0) {
      return this.#handleInputSafety(state, inputSafetyResult);
    }

    let protocol;
    if (emergencyProbe.ruleHits.length > 0) {
      this.#applyEmergencyProbe(state, emergencyProbe);
      protocol = emergencyProbe.protocol;
    } else {
      if (!state.chiefComplaint.code) {
        const detected = detectChiefComplaint(message);
        if (!detected) {
          this.#transitionState(state, {
            action: AgentAction.OUT_OF_SCOPE,
            disposition: null,
            reasonCodes: ["UNSUPPORTED_CHIEF_COMPLAINT"],
          });
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

      protocol = getProtocol(state.chiefComplaint.code);
      mergeFacts(state, extractFacts(message, state, protocol));
    }

    const emergencyRuleHits = getEmergencyRuleHits(protocol, state);

    const toolTraces = [];
    if (!state.decisionState.pathwayVersion) {
      const protocolResult = this.#callTool(
        "clinical_protocol_search",
        { chiefComplaint: state.chiefComplaint.code },
        toolTraces,
      );
      if (!protocolResult?.found && emergencyRuleHits.length === 0) {
        this.#transitionState(state, {
          action: AgentAction.INSUFFICIENT_INFO,
          disposition: Disposition.INSUFFICIENT_INFORMATION,
          reasonCodes: ["APPROVED_PROTOCOL_UNAVAILABLE"],
        });
        state.closed = true;
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
    this.#transitionState(state, {
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
    if (decision.question) {
      state.questionAttempts[decision.question.id] =
        (state.questionAttempts[decision.question.id] ?? 0) + 1;
    }

    const response = this.#buildDecisionResponse(state, decision, toolTraces);
    if (isTerminalAction(decision.action)) {
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
      const pregnancyBoundary = decision.reasonCodes.includes(
        "PREGNANCY_OUT_OF_SCOPE",
      );
      return {
        action: decision.action,
        disposition: null,
        reasonCodes: decision.reasonCodes,
        message: pregnancyBoundary
          ? "当前版本不支持孕期症状评估，请联系产科、急诊科或其他医疗专业人员。"
          : "当前版本仅支持已满 18 周岁的成年人。未成年人请由监护人联系医疗专业人员进行评估。",
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
      this.#transitionState(state, {
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
    const isDiagnosisBoundary =
      result.code === InputSafetyCode.DIAGNOSIS_BOUNDARY;
    this.#transitionState(state, {
      action: AgentAction.OUT_OF_SCOPE,
      disposition: null,
      reasonCodes: [result.code],
    });
    return this.#recordAndReturn(state, {
      action: AgentAction.OUT_OF_SCOPE,
      disposition: null,
      reasonCodes: [result.code],
      message: isMedicationBoundary
        ? "当前版本不提供个性化用药、处方、剂量、停药或换药建议。请咨询医生或药师，并以正式药品说明书为准。"
        : isDiagnosisBoundary
          ? "当前版本不提供疾病诊断或确诊结论，只能评估下一步处置紧急程度。"
          : "该请求试图改变或获取系统安全规则，已被拒绝。你仍可以描述头痛或胸痛症状以进行安全评估。",
    });
  }

  #probeEmergency(state, message) {
    const detectedComplaint = detectChiefComplaint(message);
    const chiefComplaint = detectedComplaint ?? state.chiefComplaint.code;
    if (!chiefComplaint) {
      return { ruleHits: [] };
    }

    const protocol = getProtocol(chiefComplaint);
    const candidate = structuredClone(state);
    candidate.chiefComplaint.code = chiefComplaint;
    candidate.chiefComplaint.rawLabel = protocol.displayName;
    const facts = extractFacts(message, candidate, protocol);
    mergeFacts(candidate, facts);
    return {
      chiefComplaint,
      facts,
      protocol,
      ruleHits: getEmergencyRuleHits(protocol, candidate),
    };
  }

  #applyEmergencyProbe(state, probe) {
    state.chiefComplaint.code = probe.chiefComplaint;
    state.chiefComplaint.rawLabel = probe.protocol.displayName;
    mergeFacts(state, probe.facts);
  }

  #handleEmergencyProbe(state, probe) {
    this.#applyEmergencyProbe(state, probe);
    state.decisionState.pathwayVersion =
      probe.protocol.code + "@" + probe.protocol.version;
    const decision = {
      action: AgentAction.SAFETY_ESCALATION,
      disposition: Disposition.EMERGENCY_NOW,
      reasonCodes: probe.ruleHits,
    };
    this.#transitionState(state, decision);
    state.closed = true;
    const toolTraces = [];
    const response = this.#buildDecisionResponse(state, decision, toolTraces);
    return this.#recordAndReturn(state, response, toolTraces);
  }

  #handleClosedSession(state) {
    const previous = state.decisionState;
    if (
      previous.action === AgentAction.SAFETY_ESCALATION ||
      previous.disposition === Disposition.EMERGENCY_NOW
    ) {
      const toolTraces = [];
      const resource = this.#callTool(
        "emergency_resource",
        { region: state.patientContext.region ?? this.#deploymentRegion },
        toolTraces,
      );
      this.#transitionState(state, {
        action: AgentAction.SAFETY_ESCALATION,
        disposition: Disposition.EMERGENCY_NOW,
        reasonCodes: [
          ...previous.reasonCodes,
          "TERMINAL_EMERGENCY_REAFFIRMED",
        ],
      });
      return this.#recordAndReturn(
        state,
        {
          action: AgentAction.SAFETY_ESCALATION,
          disposition: Disposition.EMERGENCY_NOW,
          reasonCodes: state.decisionState.reasonCodes,
          message:
            "之前已经触发立即急救条件。即使现在感觉好转，也不能据此安全降级或撤销急救建议。",
          guidance:
            resource?.instructions ?? ["立即联系当地急救服务或前往最近的急诊科。"],
          warnings: ["不要继续在线等待或自行驾车。"],
        },
        toolTraces,
      );
    }

    this.#transitionState(state, {
      action: previous.action,
      disposition: previous.disposition,
      reasonCodes: [...previous.reasonCodes, "TERMINAL_STATE_REPLAY"],
    });
    if (previous.action === AgentAction.INSUFFICIENT_INFO) {
      return this.#recordAndReturn(state, {
        action: AgentAction.INSUFFICIENT_INFO,
        disposition: Disposition.INSUFFICIENT_INFORMATION,
        reasonCodes: state.decisionState.reasonCodes,
        message:
          "本次评估已因信息不足结束。新信息需要在新会话中重新评估，请咨询医疗专业人员。",
      });
    }
    return this.#recordAndReturn(state, {
      action: AgentAction.DISPOSITION,
      disposition: previous.disposition,
      reasonCodes: state.decisionState.reasonCodes,
      message:
        "本次评估已经结束，后续输入不会修改原处置结果。如症状变化，请创建新会话重新评估。",
      guidance: ["如果症状明显加重或出现新的危险信号，请立即联系医疗专业人员。"],
    });
  }

  #callTool(name, args, traces) {
    const trace = {
      name,
      args: structuredClone(args),
      status: "success",
    };
    try {
      const rawResult = this.#tools.call(name, args);
      const result = validateToolResult(name, rawResult);
      trace.result = summarizeToolResult(result);
      traces.push(trace);
      return result;
    } catch (error) {
      trace.status = "failed";
      trace.errorCode = error.code || error.name || "TOOL_ERROR";
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
      reasonCodes: [...(safeResponse.reasonCodes ?? [])],
      ruleHits: deriveRuleHits(safeResponse),
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

  #transitionState(state, decision) {
    assertActionTransition(state.decisionState.action, decision.action);
    setDecision(state, decision);
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

function getEmergencyRuleHits(protocol, state) {
  return protocol.emergencyRules
    .filter((rule) => rule.when(state))
    .map((rule) => rule.id);
}

function deriveRuleHits(response) {
  if (response.action !== AgentAction.SAFETY_ESCALATION) {
    return [];
  }
  return (response.reasonCodes ?? []).filter(
    (code) => !code.startsWith("TERMINAL_"),
  );
}
