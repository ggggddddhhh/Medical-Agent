import { useEffect, useMemo, useRef, useState } from "react";
import { demoApi } from "./api/demo-api.js";

const SESSION_STORAGE_KEY = "medical-agent-session-history-v1";

const WELCOME = {
  role: "agent",
  id: "welcome",
  response: {
    riskLevel: "READY",
    summary: "您好，我是 Medical Agent。请描述您本人的不适，我会记住已确认信息，只追问仍缺失的安全要点。",
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

const FACT_LABELS = {
  "chiefComplaint.code": "主诉类型",
  "patientContext.adultConfirmed": "成年状态",
  "symptoms.onsetPattern": "起病方式",
  "symptoms.severity": "疼痛程度",
  "symptoms.activeNow": "当前是否持续",
  "redFlags.difficultyBreathing": "呼吸困难",
  "redFlags.pressureOrCrushing": "压榨或紧缩感",
  "redFlags.painRadiation": "放射痛",
  "redFlags.collapseOrSweating": "晕厥或冷汗",
  "redFlags.neurologicalDeficit": "神经功能异常",
  "redFlags.feverNeckStiffness": "发热伴颈强直",
  "redFlags.alteredConsciousness": "意识异常",
  "redFlags.recentHeadTrauma": "近期头部外伤"
};

export default function App({ api = demoApi }) {
  const [cases, setCases] = useState([]);
  const [messages, setMessages] = useState([WELCOME]);
  const [sessionId, setSessionId] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [sessionHistory, setSessionHistory] = useState(loadSessionHistory);
  const [snapshot, setSnapshot] = useState(WELCOME.response);
  const [caseState, setCaseState] = useState(null);
  const [stateChanges, setStateChanges] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [serviceState, setServiceState] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const previousStateRef = useRef(null);

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

  useEffect(() => saveSessionHistory(sessionHistory), [sessionHistory]);

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
  const memory = sessionInfo?.memory ?? snapshot?.memory ?? null;
  const pending = sessionInfo?.pendingClarification ?? memory?.nextQuestion ?? null;
  const turnCount = caseState?.turnCount ?? localTurnCount;
  const confirmedFacts = useMemo(() => factsFromState(caseState), [caseState]);
  const answeredPaths = memory?.answeredFactPaths ?? confirmedFacts.map((fact) => fact.path);
  const pendingPaths = pending?.factPath ? [pending.factPath] : [];
  const flowStage = snapshot?.riskLevel === "READY"
    ? 0
    : snapshot?.action === "ASK_MORE"
      ? 2
      : 5;

  async function refreshSession(id, { name, riskLevel } = {}) {
    try {
      const session = await api.getSession(id);
      const nextState = session.state ?? null;
      const changes = diffCaseState(previousStateRef.current, nextState);
      if (changes.length > 0) {
        setStateChanges((items) => [...items, ...changes].slice(-8));
      }
      previousStateRef.current = nextState ? structuredClone(nextState) : null;
      setCaseState(nextState);
      setSessionInfo(session);
      rememberSession({
        sessionId: id,
        name,
        riskLevel: riskLevel ?? riskFromSession(session),
        turnCount: nextState?.turnCount ?? 0,
        memoryStatus: session.memory?.persistenceStatus ?? "unknown"
      });
      return session;
    } catch {
      setCaseState(null);
      setSessionInfo(null);
      return null;
    }
  }

  function rememberSession(summary) {
    setSessionHistory((items) => {
      const existing = items.find((item) => item.sessionId === summary.sessionId);
      const updated = {
        ...existing,
        ...summary,
        name: summary.name || existing?.name || "未命名安全会话",
        updatedAt: new Date().toISOString()
      };
      return [updated, ...items.filter((item) => item.sessionId !== summary.sessionId)].slice(0, 8);
    });
  }

  async function runCase(selected) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setMessages([]);
    setStateChanges([]);
    previousStateRef.current = null;
    setSelectedCase(selected.id);
    try {
      const result = await api.runCase(selected.id);
      setMessages(result.turns.flatMap((turn) => [
        { role: "user", id: "case-" + turn.turn + "-user", text: turn.userMessage },
        { role: "agent", id: "case-" + turn.turn + "-agent", response: turn.response }
      ]));
      setSessionId(result.sessionId);
      setSnapshot(result.finalResponse);
      setStateChanges(changesFromTurns(result.turns));
      setServiceState("online");
      await refreshSession(result.sessionId, {
        name: selected.title,
        riskLevel: result.finalResponse.riskLevel
      });
    } catch (error) {
      setNotice(error.message);
      setServiceState("offline");
      setMessages([WELCOME]);
      setSnapshot(WELCOME.response);
      setCaseState(null);
      setSessionInfo(null);
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
      const newSessionName = activeSessionId ? undefined : sessionNameFromInput(value);
      if (!activeSessionId) {
        const created = await api.createSession({ adultConfirmed: true });
        activeSessionId = created.sessionId;
        setSessionId(activeSessionId);
      }
      const response = await api.sendMessage(activeSessionId, value);
      setMessages((items) => [...items, { role: "agent", id: "agent-" + Date.now(), response }]);
      setSnapshot(response);
      setServiceState("online");
      await refreshSession(activeSessionId, {
        name: newSessionName,
        riskLevel: response.riskLevel
      });
    } catch (error) {
      setNotice(error.message);
      setServiceState("offline");
    } finally {
      setBusy(false);
    }
  }

  async function restoreSession(item) {
    if (busy || typeof api.resumeSession !== "function") return;
    setBusy(true);
    setNotice(null);
    setSelectedCase(null);
    setStateChanges([]);
    previousStateRef.current = null;
    try {
      const restored = await api.resumeSession(item.sessionId);
      const historyPayload = typeof api.getHistory === "function"
        ? await api.getHistory(item.sessionId)
        : { history: [] };
      const restoredSnapshot = snapshotFromSession(restored);
      setSessionId(item.sessionId);
      setSessionInfo(restored);
      setCaseState(restored.state ?? null);
      previousStateRef.current = restored.state ? structuredClone(restored.state) : null;
      setSnapshot(restoredSnapshot);
      setMessages(messagesFromHistory(historyPayload.history, restoredSnapshot));
      setStateChanges([{
        id: `restore-${Date.now()}`,
        turn: restored.state?.turnCount ?? 0,
        label: "恢复检查点",
        value: `${restored.memory?.snapshotCount ?? 0} 个状态快照已校验`
      }]);
      rememberSession({
        ...item,
        riskLevel: restoredSnapshot.riskLevel,
        turnCount: restored.state?.turnCount ?? 0,
        memoryStatus: restored.memory?.persistenceStatus ?? "unknown"
      });
      setServiceState("online");
    } catch (error) {
      setNotice(`会话恢复失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([WELCOME]); setSessionId(null); setSessionInfo(null);
    setSnapshot(WELCOME.response); setCaseState(null); setStateChanges([]);
    previousStateRef.current = null;
    setSelectedCase(null); setInput(""); setNotice(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Icon name="pulse" /></span><span><strong>Medical Agent</strong><small>Safety-first clinical assistant</small></span></div>
        <div className="header-flow" aria-label="Agent 工作流">
          {["用户输入", "记忆检索", "主动规划", "安全裁决", "知识支持", "安全回复"].map((item, index) => <span key={item} className={flowStage >= index ? "active" : ""}>{item}{index < 5 && <i>›</i>}</span>)}
        </div>
        <div className="top-actions"><ServiceBadge state={serviceState} /><button className="icon-button" type="button" onClick={reset} aria-label="新会话"><Icon name="plus" /></button></div>
      </header>

      <main className="three-column-layout">
        <aside className="case-sidebar">
          <div className="sidebar-heading"><p>会话记忆</p><span>SESSION HISTORY</span></div>
          <div className="session-list" aria-label="历史会话列表">
            {sessionHistory.length > 0 ? sessionHistory.map((item) => (
              <SessionItem key={item.sessionId} item={item} active={sessionId === item.sessionId} busy={busy} onRestore={() => restoreSession(item)} />
            )) : <div className="empty-sessions"><Icon name="history" /><strong>暂无历史会话</strong><span>完成首轮对话后自动生成安全检查点</span></div>}
          </div>
          <div className="sidebar-divider" />
          <div className="sidebar-heading demo-heading"><p>演示场景</p><span>{cases.length || 3} CASES</span></div>
          <div className="case-list">
            {cases.map((item, index) => <CaseButton key={item.id} item={item} index={index} active={selectedCase === item.id} busy={busy} onClick={() => runCase(item)} />)}
          </div>
          <div className="sidebar-divider" />
          <div className="sidebar-note"><Icon name="lock" /><p><strong>核心已冻结</strong><span>UI 无权修改风险结论</span></p></div>
        </aside>

        <section className="chat-column">
          <div className="chat-header">
            <div className="agent-identity"><span className="avatar"><Icon name="cross" /></span><div><strong>安全医疗助手</strong><span><i />在线 · Stateful safety intelligence</span></div></div>
            <button className="new-chat" type="button" onClick={reset}><Icon name="edit" />新会话</button>
          </div>
          <SafetyBanner emergency={snapshot?.riskLevel === "EMERGENCY_NOW"} />
          <AgentTrace snapshot={snapshot} memory={memory} hasInput={messages.some((message) => message.role === "user")} />
          {notice && <div className="notice" role="alert"><Icon name="alert" /><span>{notice}</span></div>}
          <div className="message-list" aria-live="polite">
            <div className="conversation-date"><span>当前安全会话</span></div>
            {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
            {busy && <div className="thinking"><span className="mini-avatar"><Icon name="cross" /></span><div><i /><i /><i /></div><small>正在校验证据与安全规则</small></div>}
            <div ref={chatEndRef} />
          </div>
          {followUps.length > 0 && <QuestionCard question={followUps[0]} pending={pending} onUse={() => inputRef.current?.focus()} />}
          <form className="composer" onSubmit={sendMessage}>
            <label htmlFor="symptom-input" className="sr-only">描述症状或回答追问</label>
            <textarea ref={inputRef} id="symptom-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="描述您的症状，或回答上方追问…" rows="2" />
            <div className="composer-bottom"><span><Icon name="database" />发送后写入 Session Checkpoint</span><button type="submit" disabled={!input.trim() || busy} aria-label="发送消息"><Icon name="arrow" /></button></div>
          </form>
          <p className="disclaimer">Medical Agent 可能出错。紧急情况请立即联系当地急救服务。</p>
        </section>

        <aside className="agent-panel" aria-label="Agent 状态">
          <div className="panel-heading"><div><p>MEMORY INSPECTOR</p><h2>Agent Memory</h2></div><Badge tone="success">LIVE</Badge></div>
          <MemoryOverview sessionId={sessionId} memory={memory} turnCount={turnCount} />
          <MemoryFacts confirmedFacts={confirmedFacts} answeredPaths={answeredPaths} pendingPaths={pendingPaths} />
          <StateTimeline changes={stateChanges} />
          <RiskCard risk={risk} raw={snapshot?.riskLevel ?? "READY"} />
          <Panel title="CaseState" icon="layers" badge={caseState?.closed ? "CLOSED" : caseState ? "ACTIVE" : "WAITING"}>
            <StatusRow label="主诉" value={caseState?.chiefComplaint?.rawLabel || "尚未识别"} />
            <StatusRow label="当前动作" value={snapshot?.action || "READY"} mono />
            <StatusRow label="已确认事实" value={confirmedFacts.length + " 项"} />
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

function SessionItem({ item, active, busy, onRestore }) {
  const meta = RISK_META[item.riskLevel] ?? RISK_META.READY;
  return (
    <article className={"session-item " + (active ? "active" : "")}>
      <div className="session-item-top">
        <span className="session-memory-icon"><Icon name="database" /></span>
        <div><strong>{item.name}</strong><small>{relativeTime(item.updatedAt)} · {item.turnCount ?? 0} 轮</small></div>
        <Badge tone={meta.tone}>{meta.short}</Badge>
      </div>
      <div className="session-item-bottom"><code>{shortSessionId(item.sessionId)}</code><button type="button" onClick={onRestore} disabled={busy}><Icon name="refresh" />恢复</button></div>
    </article>
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

function AgentTrace({ snapshot, memory, hasInput }) {
  const steps = [
    { label: "用户输入", detail: hasInput ? "已接收" : "等待中", done: hasInput },
    { label: "Fact Extraction", detail: snapshot?.semantic?.extractionStatus ?? "待运行", done: Boolean(snapshot?.semantic) },
    { label: "Question Planner", detail: memory?.nextQuestion ? "缺口已排序" : hasInput ? "无需追问" : "待运行", done: Boolean(memory) || hasInput },
    { label: "Safety Core", detail: snapshot?.coreDecisionTraceId ? "已裁决" : "待运行", done: Boolean(snapshot?.coreDecisionTraceId) },
    { label: "RAG", detail: snapshot?.knowledgeSupport?.status ?? "not requested", done: Boolean(snapshot?.knowledgeSupport) },
    { label: "Response", detail: snapshot?.riskLevel === "READY" ? "等待中" : "已保护输出", done: snapshot?.riskLevel !== "READY" }
  ];
  return (
    <section className="agent-trace" aria-label="Agent Trace">
      <header><span><Icon name="branch" />AGENT TRACE</span><small>LIVE EXECUTION</small></header>
      <ol>{steps.map((step, index) => <li key={step.label} className={step.done ? "done" : ""}><i>{step.done ? "✓" : index + 1}</i><span><strong>{step.label}</strong><small>{step.detail}</small></span></li>)}</ol>
    </section>
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

function QuestionCard({ question, pending, onUse }) {
  const path = pending?.factPath;
  const priority = questionPriority(path);
  return (
    <button className="question-card" type="button" onClick={onUse}>
      <span className="question-icon"><Icon name="help" /></span>
      <span className="question-content"><small>QUESTION PLANNER · 主动追问</small><strong>{question}</strong><span className="question-meta"><em>缺失：{factLabel(path) || "安全评估信息"}</em><em>原因：{questionReason(path)}</em></span></span>
      <span className="question-action"><Badge tone={priority.tone}>{priority.label}</Badge><span className="answer-hint">点击回答 <Icon name="chevron" /></span></span>
    </button>
  );
}

function MemoryOverview({ sessionId, memory, turnCount }) {
  return (
    <Panel title="Current Session Memory" icon="database" badge={memory?.persistenceStatus === "available" ? "CHECKPOINTED" : sessionId ? "SYNCING" : "EMPTY"} badgeTone={memory?.persistenceStatus === "available" ? "success" : "neutral"}>
      <StatusRow label="Session" value={sessionId ? shortSessionId(sessionId) : "尚未创建"} mono />
      <StatusRow label="持久化" value={memory?.restorable ? "可恢复" : sessionId ? "等待检查点" : "未启用"} />
      <StatusRow label="状态快照" value={`${memory?.snapshotCount ?? 0} 个`} />
      <StatusRow label="消息 / 轮次" value={`${memory?.historyMessageCount ?? 0} / ${turnCount}`} />
    </Panel>
  );
}

function MemoryFacts({ confirmedFacts, answeredPaths, pendingPaths }) {
  return (
    <section className="inspector-card memory-facts">
      <header><span><Icon name="brain" />Fact Memory</span><Badge tone="info">{confirmedFacts.length} FACTS</Badge></header>
      <div className="memory-group"><small>已确认医疗事实</small><div className="fact-stack">{confirmedFacts.length > 0 ? confirmedFacts.slice(0, 6).map((fact) => <span key={fact.path}><b>{factLabel(fact.path)}</b>{formatFactValue(fact.value)}</span>) : <em>等待患者提供可验证事实</em>}</div></div>
      <div className="memory-group"><small>已回答字段</small><div className="memory-chips">{answeredPaths.length > 0 ? answeredPaths.slice(0, 8).map((path) => <span key={path}>✓ {factLabel(path)}</span>) : <em>暂无</em>}</div></div>
      <div className="memory-group pending"><small>待确认字段</small><div className="memory-chips">{pendingPaths.length > 0 ? pendingPaths.map((path) => <span key={path}>? {factLabel(path)}</span>) : <em>当前无待确认字段</em>}</div></div>
    </section>
  );
}

function StateTimeline({ changes }) {
  return (
    <section className="inspector-card state-timeline">
      <header><span><Icon name="history" />CaseState 变化记录</span><Badge>{changes.length} EVENTS</Badge></header>
      <ol>{changes.length > 0 ? changes.slice(-5).reverse().map((change) => <li key={change.id}><i /><div><strong>{change.label}</strong><span>{change.value}</span><small>TURN {change.turn}</small></div></li>) : <li className="empty-change"><i /><div><strong>等待状态变化</strong><span>每轮只记录经过 Gate 的事实</span></div></li>}</ol>
    </section>
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

function factsFromState(state) {
  return Object.entries(state?.factMetadata ?? {})
    .filter(([, metadata]) => metadata?.status === "known" || metadata?.status === "conflicting")
    .map(([path, metadata]) => ({ path, value: metadata.value, status: metadata.status }))
    .filter((fact) => fact.value !== undefined && fact.value !== null)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function diffCaseState(previous, next) {
  if (!next) return [];
  const before = new Map(factsFromState(previous).map((fact) => [fact.path, fact.value]));
  return factsFromState(next)
    .filter((fact) => JSON.stringify(before.get(fact.path)) !== JSON.stringify(fact.value))
    .map((fact, index) => ({
      id: `${next.sessionId ?? "session"}-${next.turnCount ?? 0}-${fact.path}-${index}`,
      turn: next.factMetadata?.[fact.path]?.updatedAtTurn ?? next.turnCount ?? 0,
      label: factLabel(fact.path),
      value: `记录为 ${formatFactValue(fact.value)}`
    }));
}

function changesFromTurns(turns = []) {
  return turns.flatMap((turn) => {
    const accepted = turn.response?.semantic?.decisions?.filter((decision) => decision.decision === "ACCEPT") ?? [];
    return accepted.map((decision, index) => ({
      id: `demo-${turn.turn}-${decision.factPath ?? index}`,
      turn: turn.turn,
      label: factLabel(decision.factPath),
      value: "由 Semantic Gate 接受"
    }));
  }).slice(-8);
}

function snapshotFromSession(session) {
  const state = session?.state ?? {};
  const decision = state.decisionState ?? {};
  const planned = session?.memory?.nextQuestion;
  const pendingQuestion = session?.pendingClarification?.question?.text ?? planned?.text;
  const riskLevel = decision.disposition ?? (decision.action === "ASK_MORE" ? "ASK_MORE" : "READY");
  return {
    ...WELCOME.response,
    action: decision.action ?? (pendingQuestion ? "ASK_MORE" : "READY"),
    disposition: decision.disposition ?? null,
    riskLevel,
    summary: pendingQuestion ? "会话已从持久化检查点恢复，请继续回答尚未确认的信息。" : "会话已从持久化检查点恢复。",
    reasoning: ["历史消息与 CaseState 快照已校验，继续沿用同一安全状态。"],
    followUpQuestions: pendingQuestion ? [pendingQuestion] : [],
    memory: session?.memory ?? null,
    knowledgeSupport: { status: "not_requested", snippets: [], sources: [] }
  };
}

function messagesFromHistory(history = [], restoredSnapshot) {
  const restored = history.map((entry, index) => entry.role === "user"
    ? { role: "user", id: `restored-${index}`, text: entry.content }
    : {
        role: "agent",
        id: `restored-${index}`,
        response: { ...WELCOME.response, riskLevel: "INSUFFICIENT_INFO", summary: entry.content }
      });
  return restored.length > 0 ? restored : [{ role: "agent", id: "restored-status", response: restoredSnapshot }];
}

function loadSessionHistory() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(SESSION_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.sessionId).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveSessionHistory(items) {
  try {
    globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Browser storage is presentation-only; the server checkpoint remains authoritative.
  }
}

function riskFromSession(session) {
  const decision = session?.state?.decisionState;
  return decision?.disposition ?? (decision?.action === "ASK_MORE" ? "ASK_MORE" : "READY");
}

function sessionNameFromInput(value) {
  if (/胸|心口|胸口/.test(value)) return "胸部不适评估";
  if (/头|脑袋|头部/.test(value)) return "头部不适评估";
  return "安全分流会话";
}

function shortSessionId(value) {
  if (!value) return "—";
  return value.length > 13 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function relativeTime(value) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return `${Math.floor(elapsed / 86_400_000)} 天前`;
}

function factLabel(path) {
  if (!path) return "安全评估信息";
  return FACT_LABELS[path] ?? path.split(".").at(-1)?.replace(/([A-Z])/g, " $1").trim() ?? path;
}

function formatFactValue(value) {
  if (value === true) return "是";
  if (value === false) return "否";
  if (Array.isArray(value)) return value.join("、");
  return String(value).replaceAll("_", " ");
}

function questionPriority(path) {
  if (path?.startsWith("redFlags.")) return { label: "P0 高风险", tone: "danger" };
  if (path === "chiefComplaint.code" || path === "patientContext.adultConfirmed") return { label: "P1 必要", tone: "warning" };
  return { label: "P2 路径", tone: "info" };
}

function questionReason(path) {
  if (path?.startsWith("redFlags.")) return "排除可能改变紧急程度的危险信号";
  if (path === "patientContext.adultConfirmed") return "确认当前版本适用范围";
  if (path === "chiefComplaint.code") return "选择正确的临床安全路径";
  return "补齐当前路径的最小必要信息";
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
    ,database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>
    ,history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>
    ,refresh: <><path d="M20 7h-5V2" /><path d="M20 7a8 8 0 1 0 1 7" /></>
    ,branch: <><circle cx="6" cy="4" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="20" r="2" /><path d="M6 6v12M8 10c5 0 5-4 8-4" /></>
    ,brain: <><path d="M9.5 4.5A3 3 0 0 0 6 7.4 3.5 3.5 0 0 0 5 14a3 3 0 0 0 4.5 3v2.5M14.5 4.5A3 3 0 0 1 18 7.4a3.5 3.5 0 0 1 1 6.6 3 3 0 0 1-4.5 3v2.5M12 4v16M8 10h4M12 14h4" /></>
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.activity}</svg>;
}
