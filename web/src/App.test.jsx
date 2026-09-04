import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

const cases = [
  { id: "ordinary-headache", title: "普通头痛", description: "多轮头痛演示" },
  { id: "ambiguous-chest-pain", title: "模糊胸痛", description: "胸痛追问演示" },
  { id: "high-risk-chest-pain", title: "高风险胸痛", description: "急救安全演示" }
];

function response(overrides = {}) {
  return {
    action: "ASK_MORE",
    disposition: null,
    riskLevel: "ASK_MORE",
    summary: "还需要确认一项信息。",
    reasoning: ["当前信息不足。"],
    recommendedAction: ["请回答追问。"],
    warningSigns: [],
    followUpQuestions: ["疼痛是突然出现的吗？"],
    knowledgeSupport: { status: "not_requested", snippets: [], sources: [] },
    coreDecisionTraceId: "core-trace-1",
    semantic: {
      extractionStatus: "completed",
      fallbackToSafetyCore: false,
      gateSummary: { ACCEPT: 1, UNCERTAIN: 0, REJECT: 0 },
      decisions: []
    },
    memory: {
      persistenceStatus: "available",
      restorable: true,
      historyMessageCount: 2,
      snapshotCount: 2,
      answeredFactPaths: ["patientContext.adultConfirmed"],
      nextQuestion: { id: "ONSET", factPath: "symptoms.onsetPattern", text: "疼痛是突然出现的吗？" },
      duplicateQuestionFiltered: false
    },
    ...overrides
  };
}

function api(overrides = {}) {
  return {
    health: vi.fn().mockResolvedValue({ status: "ok" }),
    listCases: vi.fn().mockResolvedValue({ cases }),
    runCase: vi.fn(),
    createSession: vi.fn().mockResolvedValue({ sessionId: "session-1" }),
    sendMessage: vi.fn(),
    getSession: vi.fn().mockResolvedValue({
      state: {
        turnCount: 1,
        closed: false,
        chiefComplaint: { code: "headache", rawLabel: "头痛" },
        decisionState: { action: "ASK_MORE", disposition: null },
        factMetadata: {
          "chiefComplaint.code": { status: "known", value: "headache", updatedAtTurn: 1 },
          "patientContext.adultConfirmed": { status: "known", value: true, updatedAtTurn: 0 }
        }
      },
      pendingClarification: {
        factPath: "symptoms.onsetPattern",
        question: { id: "ONSET", text: "疼痛是突然出现的吗？" }
      },
      memory: response().memory
    }),
    resumeSession: vi.fn(),
    getHistory: vi.fn(),
    ...overrides
  };
}

describe("Medical Agent Web Demo", () => {
  beforeEach(() => localStorage.clear());

  it("replays a fixed case and displays risk plus reviewed knowledge sources", async () => {
    const finalResponse = response({
      action: "DISPOSITION",
      disposition: "SELF_MONITOR",
      riskLevel: "SELF_MONITOR",
      summary: "当前可按安全提示观察。",
      followUpQuestions: [],
      knowledgeSupport: {
        status: "available",
        snippets: [{ sourceId: "NHS_HEADACHE_2024", text: "记录症状变化。" }],
        sources: [{ sourceId: "NHS_HEADACHE_2024", title: "NHS Headaches", url: "https://www.nhs.uk/conditions/headaches/" }]
      }
    });
    const mockApi = api({
      runCase: vi.fn().mockResolvedValue({
        sessionId: "fixed-session",
        turns: [{ turn: 1, userMessage: "我头痛", response: finalResponse }],
        finalResponse
      })
    });
    render(<App api={mockApi} />);

    await userEvent.click(await screen.findByRole("button", { name: /普通头痛/ }));
    const agentPanel = screen.getByLabelText("Agent 状态");
    expect(await within(agentPanel).findByText("可居家观察")).toBeInTheDocument();
    expect(screen.getByText("当前可按安全提示观察。")).toBeInTheDocument();
    expect(screen.getByText("知识支持已返回")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /NHS Headaches/ })).toHaveAttribute("href", "https://www.nhs.uk/conditions/headaches/");
    expect(within(agentPanel).getByText("EVALUATED")).toBeInTheDocument();
    expect(within(agentPanel).getByText("ACTIVE")).toBeInTheDocument();
    expect(mockApi.getSession).toHaveBeenCalledWith("fixed-session");
  });

  it("keeps one session id across an interactive multi-turn clarification", async () => {
    const mockApi = api({
      sendMessage: vi.fn()
        .mockResolvedValueOnce(response())
        .mockResolvedValueOnce(response({ summary: "继续评估同一病例。", followUpQuestions: ["是否伴有发热？"] }))
    });
    render(<App api={mockApi} />);
    await screen.findByText("服务已连接");

    const input = screen.getByLabelText("描述症状或回答追问");
    await userEvent.type(input, "我头痛");
    await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
    expect(await screen.findByRole("button", { name: /疼痛是突然出现的吗？/ })).toBeInTheDocument();

    await userEvent.type(input, "是慢慢出现的");
    await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
    expect(await screen.findByText("继续评估同一病例。")).toBeInTheDocument();
    expect(mockApi.createSession).toHaveBeenCalledTimes(1);
    expect(mockApi.sendMessage).toHaveBeenNthCalledWith(1, "session-1", "我头痛");
    expect(mockApi.sendMessage).toHaveBeenNthCalledWith(2, "session-1", "是慢慢出现的");
    expect(mockApi.getSession).toHaveBeenCalledTimes(2);
  });

  it("renders emergency safety escalation without implying that RAG changed the decision", async () => {
    const emergency = response({
      action: "SAFETY_ESCALATION",
      disposition: "EMERGENCY_NOW",
      riskLevel: "EMERGENCY_NOW",
      summary: "请立即联系急救服务。",
      followUpQuestions: [],
      knowledgeSupport: { status: "not_requested", snippets: [], sources: [] }
    });
    const mockApi = api({
      runCase: vi.fn().mockResolvedValue({
        sessionId: "emergency-session",
        turns: [{ turn: 1, userMessage: "胸口像石头压着，喘不上气", response: emergency }],
        finalResponse: emergency
      })
    });
    render(<App api={mockApi} />);

    await userEvent.click(await screen.findByRole("button", { name: /高风险胸痛/ }));
    expect(await screen.findByText("已触发紧急安全升级")).toBeInTheDocument();
    const agentPanel = screen.getByLabelText("Agent 状态");
    expect(within(agentPanel).getByText("立即寻求急救")).toBeInTheDocument();
    expect(within(agentPanel).getByText("本轮未调用 RAG")).toBeInTheDocument();
    expect(within(agentPanel).getByText("EMERGENCY_NOW")).toBeInTheDocument();
  });

  it("shows an explicit disconnected state without inventing medical output", async () => {
    const mockApi = api({ health: vi.fn().mockRejectedValue(new Error("Demo API 暂时不可用")) });
    render(<App api={mockApi} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Demo API 暂时不可用");
    expect(screen.getByText("服务未连接")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("已经确诊");
  });

  it("shows Session History, Fact Memory, pending fields and the six-step Agent Trace", async () => {
    const mockApi = api({ sendMessage: vi.fn().mockResolvedValue(response()) });
    render(<App api={mockApi} />);
    await screen.findByText("服务已连接");

    await userEvent.type(screen.getByLabelText("描述症状或回答追问"), "我头痛");
    await userEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("头部不适评估", { selector: ".session-item strong" })).toBeInTheDocument();
    expect(screen.getByLabelText("历史会话列表")).toHaveTextContent("ASK MORE");
    const panel = screen.getByLabelText("Agent 状态");
    expect(within(panel).getByText("Current Session Memory")).toBeInTheDocument();
    expect(within(panel).getByText("Fact Memory")).toBeInTheDocument();
    expect(within(panel).getByText("已回答字段")).toBeInTheDocument();
    expect(within(panel).getByText("待确认字段")).toBeInTheDocument();
    expect(within(panel).getByText("CaseState 变化记录")).toBeInTheDocument();

    const trace = screen.getByLabelText("Agent Trace");
    for (const label of ["用户输入", "Fact Extraction", "Question Planner", "Safety Core", "RAG", "Response"]) {
      expect(within(trace).getByText(label)).toBeInTheDocument();
    }
    const question = screen.getByRole("button", { name: /疼痛是突然出现的吗/ });
    expect(question).toHaveTextContent("缺失：起病方式");
    expect(question).toHaveTextContent("原因：补齐当前路径的最小必要信息");
    expect(question).toHaveTextContent("P2 路径");
  });

  it("restores a persisted session through the existing resume and history routes", async () => {
    localStorage.setItem("medical-agent-session-history-v1", JSON.stringify([{
      sessionId: "saved-session-42",
      name: "昨晚胸口不舒服",
      updatedAt: new Date().toISOString(),
      riskLevel: "ASK_MORE",
      turnCount: 1
    }]));
    const restored = {
      state: {
        sessionId: "saved-session-42",
        turnCount: 1,
        closed: false,
        chiefComplaint: { code: "chest_pain", rawLabel: "胸痛" },
        decisionState: { action: "ASK_MORE", disposition: null },
        factMetadata: { "chiefComplaint.code": { status: "known", value: "chest_pain", updatedAtTurn: 1 } }
      },
      pendingClarification: {
        factPath: "redFlags.difficultyBreathing",
        question: { id: "BREATHING", text: "胸痛时有没有呼吸困难？" }
      },
      memory: {
        persistenceStatus: "available", restorable: true, historyMessageCount: 2,
        snapshotCount: 2, answeredFactPaths: ["chiefComplaint.code"],
        nextQuestion: { id: "BREATHING", factPath: "redFlags.difficultyBreathing", text: "胸痛时有没有呼吸困难？" }
      }
    };
    const mockApi = api({
      resumeSession: vi.fn().mockResolvedValue(restored),
      getHistory: vi.fn().mockResolvedValue({ history: [
        { role: "user", content: "我胸痛", turn: 1 },
        { role: "assistant", content: "还需要确认呼吸情况。", turn: 1 }
      ] })
    });
    render(<App api={mockApi} />);

    await userEvent.click(await screen.findByRole("button", { name: /恢复/ }));
    expect(mockApi.resumeSession).toHaveBeenCalledWith("saved-session-42");
    expect(mockApi.getHistory).toHaveBeenCalledWith("saved-session-42");
    expect(await screen.findByText("我胸痛")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /胸痛时有没有呼吸困难/ })).toHaveTextContent("P0 高风险");
    expect(screen.getByText("恢复检查点")).toBeInTheDocument();
  });
});
