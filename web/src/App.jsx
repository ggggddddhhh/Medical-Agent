import { useEffect, useMemo, useRef, useState } from "react";
import { demoApi } from "./api/demo-api.js";

const WELCOME = {
  role: "agent",
  id: "welcome",
  response: {
    riskLevel: "READY",
    summary: "您好，我是 Medical Agent。请描述您本人的不适，我会先确认关键信息，再给出安全的下一步建议。",
    reasoning: ["本演示用于安全分流与就医准备，不替代医生诊断。"],
    recommendedAction: [], warningSigns: [], followUpQuestions: []
  }
};

const RISK_META = {
  READY: { label: "等待描述", tone: "neutral", short: "READY" },
  ASK_MORE: { label: "需要补充信息", tone: "info", short: "ASK MORE" },
  SELF_MONITOR: { label: "可居家观察", tone: "safe", short: "LOW RISK" },
  CLINIC_SOON: { label: "建议近期门诊", tone: "warning", short: "CLINIC" },
  URGENT_SAME_DAY: { label: "建议当日就医", tone: "urgent", short: "URGENT" },
  EMERGENCY_NOW: { label: "立即寻求急救", tone: "danger", short: "EMERGENCY" },
  SAFETY_ESCALATION: { label: "安全升级", tone: "danger", short: "ESCALATED" },
  OUT_OF_SCOPE: { label: "超出评估范围", tone: "neutral", short: "OUT OF SCOPE" },
  INSUFFICIENT_INFO: { label: "信息不足", tone: "info", short: "INCOMPLETE" },
  INSUFFICIENT_INFORMATION: { label: "信息不足", tone: "info", short: "INCOMPLETE" }
};

const KNOWLEDGE_META = {
  available: ["知识支持已返回", "已通过只读 RAG 获取经审核的健康教育资料。", "success"],
  no_results: ["暂无匹配资料", "检索无结果，系统没有补写或猜测内容。", "muted"],
  unavailable: ["知识服务已降级", "RAG 不可用，风险结论与安全回复保持不变。", "warning"],
  not_requested: ["本轮未调用 RAG", "当前流程无需知识增强，安全裁决独立完成。", "muted"]
};

export default function App({ api = demoApi }) {
  const [cases, setCases] = useState([]);
  const [messages, setMessages] = useState([WELCOME]);
  const [sessionId, setSessionId] = useState(null);
  const [snapshot, setSnapshot] = useState(WELCOME.response);
  const [caseState, setCaseState] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [serviceState, setServiceState] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let current = true;
    Promise.all([api.health(), api.listCases()])
      .then(([, catalog]) => {
        if (!current) return;
        setCases(catalog.cases ?? []);
        setServiceState("online");
      })
      .catch((error) => {
        if (!current) return;
        setServiceState("offline");
        setNotice(error.message);
      });
    return () => { current = false; };
  }, [api]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const localTurnCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages]
  );
  const risk = RISK_META[snapshot?.riskLevel] ?? {
    label: snapshot?.riskLevel || "等待描述", tone: "neutral", short: "UNKNOWN"
  };
  const followUps = snapshot?.followUpQuestions ?? [];
  const knowledge = snapshot?.knowledgeSupport;
  const semantic = snapshot?.semantic;
  const turnCount = caseState?.turnCount ?? localTurnCount;
  const knownFacts = caseState
    ? Object.values(caseState.factMetadata ?? {}).filter((item) => item.status === "known").length
    : 0;
  const flowStage = snapshot?.riskLevel === "READY"
    ? 0
    : snapshot?.action === "ASK_MORE"
      ? 1
      : knowledge?.status === "available"
        ? 4
        : 3;

  async function refreshCaseState(id) {
    try {
      const session = await api.getSession(id);
      setCaseState(session.state ?? null);
    } catch {
      setCaseState(null);
    }
  }

  async function runCase(selected) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setMessages([]);
    setSelectedCase(selected.id);
    try {
      const result = await api.runCase(selected.id);
      setMessages(result.turns.flatMap((turn) => [
        { role: "user", id: "case-" + turn.turn + "-user", text: turn.userMessage },
        { role: "agent", id: "case-" + turn.turn + "-agent", response: turn.response }
      ]));
      setSessionId(result.sessionId);
      setSnapshot(result.finalResponse);
      setServiceState("online");
      await refreshCaseState(result.sessionId);
    } catch (error) {
      setNotice(error.message);
      setServiceState("offline");
      setMessages([WELCOME]);
      setSnapshot(WELCOME.response);
      setCaseState(null);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const value = input.trim();
    if (!value || busy) return;
    setInput("");
    setNotice(null);
    setSelectedCase(null);
    setMessages((items) => [...items, { role: "user", id: "user-" + Date.now(), text: value }]);
    setBusy(true);
    try {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        const created = await api.createSession({ adultConfirmed: true });
        activeSessionId = created.sessionId;
        setSessionId(activeSessionId);
      }
      const response = await api.sendMessage(activeSessionId, value);
      setMessages((items) => [...items, { role: "agent", id: "agent-" + Date.now(), response }]);
      setSnapshot(response);
      setServiceState("online");
      await refreshCaseState(activeSessionId);
    } catch (error) {
      setNotice(error.message);
      setServiceState("offline");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([WELCOME]); setSessionId(null); setSnapshot(WELCOME.response);
    setCaseState(null); setSelectedCase(null); setInput(""); setNotice(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Icon name="pulse" /></span><span><strong>Medical Agent</strong><small>Safety-first clinical assistant</small></span></div>
        <div className="header-flow" aria-label="Agent 工作流">
          {["用户症状", "Agent 追问", "风险判断", "安全回复", "知识支持"].map((item, index) => <span key={item} className={flowStage >= index ? "active" : ""}>{item}{index < 4 && <i>›</i>}</span>)}
        </div>
        <div className="top-actions"><ServiceBadge state={serviceState} /><button className="icon-button" type="button" onClick={reset} aria-label="新会话"><Icon name="plus" /></button></div>
      </header>

      <main className="three-column-layout">
        <aside className="case-sidebar">
          <div className="sidebar-heading"><p>演示场景</p><span>3 CASES</span></div>
          <div className="case-list">
            {cases.map((item, index) => <CaseButton key={item.id} item={item} index={index} active={selectedCase === item.id} busy={busy} onClick={() => runCase(item)} />)}
          </div>
          <div className="sidebar-divider" />
          <div className="mini-flow">
            <p>临床安全流水线</p>
            <ol><li><Icon name="message" /><span><strong>理解表达</strong><small>Evidence + Assertion</small></span></li><li><Icon name="shield" /><span><strong>安全裁决</strong><small>Gate + Safety Core</small></span></li><li><Icon name="book" /><span><strong>知识解释</strong><small>Read-only LightRAG</small></span></li></ol>
          </div>
          <div className="sidebar-note"><Icon name="lock" /><p><strong>核心已冻结</strong><span>UI 无权修改风险结论</span></p></div>
        </aside>

        <section className="chat-column">
          <div className="chat-header">
            <div className="agent-identity"><span className="avatar"><Icon name="cross" /></span><div><strong>安全医疗助手</strong><span><i />在线 · 仅限头痛与胸痛安全分流</span></div></div>
            <button className="new-chat" type="button" onClick={reset}><Icon name="edit" />新会话</button>
          </div>
          <SafetyBanner emergency={snapshot?.riskLevel === "EMERGENCY_NOW"} />
          {notice && <div className="notice" role="alert"><Icon name="alert" /><span>{notice}</span></div>}
          <div className="message-list" aria-live="polite">
            <div className="conversation-date"><span>当前安全会话</span></div>
            {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
            {busy && <div className="thinking"><span className="mini-avatar"><Icon name="cross" /></span><div><i /><i /><i /></div><small>正在校验证据与安全规则</small></div>}
            <div ref={chatEndRef} />
          </div>
          {followUps.length > 0 && <QuestionCard question={followUps[0]} onUse={() => inputRef.current?.focus()} />}
          <form className="composer" onSubmit={sendMessage}>
            <label htmlFor="symptom-input" className="sr-only">描述症状或回答追问</label>
            <textarea ref={inputRef} id="symptom-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="描述您的症状，或回答上方追问…" rows="2" />
            <div className="composer-bottom"><span><Icon name="lock" />内容仅用于本次演示</span><button type="submit" disabled={!input.trim() || busy} aria-label="发送消息"><Icon name="arrow" /></button></div>
          </form>
          <p className="disclaimer">Medical Agent 可能出错。紧急情况请立即联系当地急救服务。</p>
        </section>

        <aside className="agent-panel" aria-label="Agent 状态">
          <div className="panel-heading"><div><p>AGENT STATUS</p><h2>决策状态</h2></div><Badge tone="success">LIVE</Badge></div>
          <RiskCard risk={risk} raw={snapshot?.riskLevel ?? "READY"} />
          <Panel title="CaseState" icon="layers" badge={caseState?.closed ? "CLOSED" : caseState ? "ACTIVE" : "WAITING"}>
            <StatusRow label="主诉" value={caseState?.chiefComplaint?.rawLabel || "尚未识别"} />
            <StatusRow label="当前动作" value={snapshot?.action || "READY"} mono />
            <StatusRow label="已确认事实" value={knownFacts + " 项"} />
            <StatusRow label="会话轮次" value={turnCount + " 轮"} />
          </Panel>
          <Panel title="Safety Core" icon="shield" badge={snapshot?.riskLevel === "READY" ? "STANDBY" : "PROTECTED"} badgeTone="success">
            <StatusRow label="规则状态" value={snapshot?.coreDecisionTraceId ? "已执行确定性裁决" : snapshot?.riskLevel === "READY" ? "等待用户输入" : "安全边界生效"} />
            <StatusRow label="输出保护" value={snapshot?.riskLevel === "READY" ? "等待安全回复" : "Response Guard 通过"} />
          </Panel>
          <SemanticCard semantic={semantic} />
          <KnowledgeCard knowledge={knowledge} />
        </aside>
      </main>
    </div>
  );
}

function CaseButton({ item, index, active, busy, onClick }) {
  const icons = ["head", "heart", "alert"];
  return (
    <button className={"case-button " + (active ? "selected" : "")} type="button" onClick={onClick} disabled={busy}>
      <span className={"case-icon tone-" + (index + 1)}><Icon name={icons[index]} /></span>
      <span><strong>{item.title}</strong><small>{item.description}</small></span>
      <Icon name="chevron" />
    </button>
  );
}

function ServiceBadge({ state }) {
  return <span className={"service-badge " + state}><i />{state === "online" ? "服务已连接" : state === "checking" ? "正在连接" : "服务未连接"}</span>;
}

function SafetyBanner({ emergency }) {
  return (
    <div className={"safety-banner " + (emergency ? "emergency" : "")}>
      <Icon name={emergency ? "alert" : "shield"} />
      <div><strong>{emergency ? "已触发紧急安全升级" : "安全模式已启用"}</strong><span>{emergency ? "请优先执行急救提示，不要等待知识检索。" : "每条回复均经过 Semantic Gate 与 Safety Core 校验。"}</span></div>
      <Badge tone={emergency ? "danger" : "success"}>{emergency ? "EMERGENCY" : "PROTECTED"}</Badge>
    </div>
  );
}

function ChatMessage({ message }) {
  if (message.role === "user") {
    return <div className="message user"><div className="message-meta"><strong>您</strong><span>刚刚</span></div><p>{message.text}</p></div>;
  }
  const response = message.response;
  const meta = RISK_META[response.riskLevel] ?? { label: response.riskLevel, tone: "neutral" };
  return (
    <article className="message agent">
      <span className="mini-avatar"><Icon name="cross" /></span>
      <div className="agent-message">
        <div className="message-meta"><strong>Medical Agent</strong><Badge tone={meta.tone}>{meta.label}</Badge></div>
        <p className="summary">{response.summary}</p>
        {response.reasoning?.map((item) => <p className="reasoning" key={item}>{item}</p>)}
        {response.recommendedAction?.length > 0 && <ResponseList title="建议行动" items={response.recommendedAction} icon="check" />}
        {response.warningSigns?.length > 0 && <ResponseList title="危险信号提示" items={response.warningSigns} icon="alert" warning />}
      </div>
    </article>
  );
}

function ResponseList({ title, items, icon, warning = false }) {
  return <div className={"response-list " + (warning ? "warning" : "")}><div><Icon name={icon} /><strong>{title}</strong></div><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function QuestionCard({ question, onUse }) {
  return (
    <button className="question-card" type="button" onClick={onUse}>
      <span className="question-icon"><Icon name="help" /></span>
      <span><small>FOLLOW-UP QUESTION · 待确认</small><strong>{question}</strong></span>
      <span className="answer-hint">点击回答 <Icon name="chevron" /></span>
    </button>
  );
}

function RiskCard({ risk, raw }) {
  return (
    <div className={"risk-card " + risk.tone}>
      <div><span className="risk-symbol"><Icon name={risk.tone === "danger" ? "alert" : "activity"} /></span><Badge tone={risk.tone}>{risk.short}</Badge></div>
      <small>当前风险等级</small><strong>{risk.label}</strong><code>{raw}</code>
    </div>
  );
}

function Panel({ title, icon, badge, badgeTone = "neutral", children }) {
  return <section className="inspector-card"><header><span><Icon name={icon} />{title}</span><Badge tone={badgeTone}>{badge}</Badge></header><div>{children}</div></section>;
}

function StatusRow({ label, value, mono = false }) {
  return <div className="status-row"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>;
}

function SemanticCard({ semantic }) {
  const counts = semantic?.gateSummary ?? { ACCEPT: 0, UNCERTAIN: 0, REJECT: 0 };
  return (
    <section className="inspector-card semantic-card">
      <header><span><Icon name="scan" />Semantic Gate</span><Badge tone={semantic ? "success" : "neutral"}>{semantic ? "EVALUATED" : "STANDBY"}</Badge></header>
      <p>{semantic?.extractionStatus ? "Extractor: " + semantic.extractionStatus : "等待语义抽取结果"}</p>
      <div className="gate-counts"><span className="accept"><strong>{counts.ACCEPT}</strong><small>ACCEPT</small></span><span className="uncertain"><strong>{counts.UNCERTAIN}</strong><small>UNCERTAIN</small></span><span className="reject"><strong>{counts.REJECT}</strong><small>REJECT</small></span></div>
    </section>
  );
}

function KnowledgeCard({ knowledge }) {
  const status = knowledge?.status ?? "not_requested";
  const meta = KNOWLEDGE_META[status] ?? [status, "知识支持状态未知。", "muted"];
  return (
    <section className="inspector-card knowledge-card">
      <header><span><Icon name="book" />RAG Knowledge</span><Badge tone={meta[2]}>{status.toUpperCase()}</Badge></header>
      <div className="knowledge-state"><strong>{meta[0]}</strong><p>{meta[1]}</p></div>
      {knowledge?.snippets?.map((item) => <blockquote key={item.sourceId}>{item.text}</blockquote>)}
      {knowledge?.sources?.length > 0 && <div className="source-list"><small>KNOWLEDGE SOURCES</small>{knowledge.sources.map((source) => <a className="source-card" key={source.sourceId} href={source.url} target="_blank" rel="noreferrer"><span><Icon name="file" /></span><p><strong>{source.title}</strong><small>{source.sourceId}</small></p><Icon name="external" /></a>)}</div>}
    </section>
  );
}

function Badge({ tone = "neutral", children }) {
  return <span className={"badge " + tone}>{children}</span>;
}

function Icon({ name }) {
  const paths = {
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    cross: <path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z" />,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 5.5v14" /></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /></>,
    head: <><path d="M9 18h6M10 22h4" /><path d="M8.5 14A7 7 0 1 1 16 14c-1 1-1.5 2-1.5 3h-5c0-1-.2-2-1-3z" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />,
    alert: <><path d="M10.3 3.5 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    arrow: <path d="m5 12 14-7-4 14-3-6z" />,
    activity: <path d="M3 12h4l2-5 4 10 2-5h6" />,
    check: <path d="m5 12 4 4L19 6" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.7 1-.7 1.6M12 17h.01" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    scan: <><path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="3" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    external: <><path d="M14 3h7v7M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.activity}</svg>;
}
