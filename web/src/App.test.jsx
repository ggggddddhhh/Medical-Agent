import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    ...overrides
  };
}

describe("Medical Agent Web Demo", () => {
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
    expect(await screen.findByText("可居家观察")).toBeInTheDocument();
    expect(screen.getByText("当前可按安全提示观察。")).toBeInTheDocument();
    expect(screen.getByText("已返回审核知识")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /NHS Headaches/ })).toHaveAttribute("href", "https://www.nhs.uk/conditions/headaches/");
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
  });

  it("shows an explicit disconnected state without inventing medical output", async () => {
    const mockApi = api({ health: vi.fn().mockRejectedValue(new Error("Demo API 暂时不可用")) });
    render(<App api={mockApi} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Demo API 暂时不可用");
    expect(screen.getByText("服务未连接")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("已经确诊");
  });
});
