import { useEffect, useMemo, useRef, useState } from "react";
import { demoApi } from "./api/demo-api.js";

const WELCOME = {
  role: "agent",
  id: "welcome",
  response: {
    riskLevel: "READY",
    summary: "您好，我会先确认关键信息，再根据现有安全规则给出下一步建议。",
    reasoning: ["本演示用于安全分流与就医准备，不替代医生诊断。"],
    recommendedAction: [],
    warningSigns: [],
    followUpQuestions: []
  }
};

const RISK_META = {
  READY: ["等待描述", "neutral"],
  ASK_MORE: ["信息采集中", "question"],
  SELF_MONITOR: ["可居家观察", "low"],
  CLINIC_SOON: ["建议近期门诊", "medium"],
  URGENT_SAME_DAY: ["建议当日就医", "high"],
  EMERGENCY_NOW: ["立即寻求急救", "emergency"],
  SAFETY_ESCALATION: ["安全升级", "emergency"],
  OUT_OF_SCOPE: ["超出评估范围", "neutral"],
  INSUFFICIENT_INFO: ["信息不足", "question"],
  INSUFFICIENT_INFORMATION: ["信息不足", "question"]
};

const KNOWLEDGE_META = {
  available: ["已返回审核知识", "知识服务已提供来源明确的健康教育材料。"],
  no_results: ["未找到匹配知识", "系统不会在无结果时补写或猜测内容。"],
  unavailable: ["知识服务已安全降级", "风险结论保持不变，未展示未验证内容。"],
  not_requested: ["本轮未调用 RAG", "当前流程不需要额外知识支持。"]
};

export default function App({ api = demoApi }) {
  const [cases, setCases] = useState([]);
  const [messages, setMessages] = useState([WELCOME]);
  const [sessionId, setSessionId] = useState(null);
  const [snapshot, setSnapshot] = useState(WELCOME.response);
  const [serviceState, setServiceState] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState(null);
  const chatEndRef = useRef(null);

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

  const risk = RISK_META[snapshot?.riskLevel] ?? [snapshot?.riskLevel || "等待描述", "neutral"];
  const currentAction = snapshot?.action || snapshot?.riskLevel || "READY";
  const followUps = snapshot?.followUpQuestions ?? [];
  const knowledge = snapshot?.knowledgeSupport;
  const turnCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages]
  );

  async function runCase(selected) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setMessages([]);
    try {
      const result = await api.runCase(selected.id);
      const replay = result.turns.flatMap((turn) => [
        { role: "user", id: `case-${turn.turn}-user`, text: turn.userMessage },
        { role: "agent", id: `case-${turn.turn}-agent`, response: turn.response }
      ]);
      setMessages(replay);
      setSessionId(result.sessionId);
      setSnapshot(result.finalResponse);
      setServiceState("online");
    } catch (error) {
      setNotice(error.message);
      setServiceState("offline");
      setMessages([WELCOME]);
      setSnapshot(WELCOME.response);
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
    setMessages((items) => [...items, { role: "user", id: `user-${Date.now()}`, text: value }]);
    setBusy(true);
    try {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        const created = await api.createSession({ adultConfirmed: true });
        activeSessionId = created.sessionId;
        setSessionId(activeSessionId);
      }
      const response = await api.sendMessage(activeSessionId, value);
      setMessages((items) => [
        ...items,
        { role: "agent", id: `agent-${Date.now()}`, response }
      ]);
      setSnapshot(response);
      setServiceState("online");
    } catch (error) {
      setNotice(error.message);
      setServiceState("offline");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([WELCOME]);
    setSessionId(null);
    setSnapshot(WELCOME.response);
    setInput("");
    setNotice(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Medical Agent 首页">
          <span className="brand-mark">✦</span>
          <span><strong>Medical Agent</strong><small>Evidence-grounded safety demo</small></span>
        </a>
        <div className="topbar-actions">
          <span className={`service-pill ${serviceState}`}>
            <i />{serviceState === "online" ? "服务已连接" : serviceState === "checking" ? "正在连接" : "服务未连接"}
          </span>
          <button className="ghost-button" type="button" onClick={reset}>新会话</button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">COMPETITION DEMO · SAFETY FIRST</p>
            <h1>先厘清事实，再给出<br /><span>安全的下一步。</span></h1>
            <p className="hero-copy">自主追问、语义校验和风险分流协同工作；知识检索只负责解释，不改变安全裁决。</p>
          </div>
          <div className="safety-card">
            <span className="safety-icon">✓</span>
            <div><strong>Safety Core protected</strong><p>临床决策与知识内容严格隔离</p></div>
          </div>
        </section>

        <section className="case-section" aria-labelledby="case-title">
          <div className="section-heading">
            <div><p className="eyebrow">ONE-CLICK SCENARIOS</p><h2 id="case-title">选择一个演示案例</h2></div>
            <span>固定案例 · 可重复验证</span>
          </div>
          <div className="case-grid">
            {cases.map((item, index) => (
              <button className="case-card" type="button" key={item.id} onClick={() => runCase(item)} disabled={busy}>
                <span className={`case-number case-${index + 1}`}>0{index + 1}</span>
                <span className="case-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
                <span className="case-arrow">→</span>
              </button>
            ))}
          </div>
        </section>

        <section className="workspace">
          <div className="chat-panel">
            <div className="panel-title">
              <div><span className="agent-avatar">M</span><div><strong>安全医疗助手</strong><small>不会给出诊断 · 紧急情况请联系急救</small></div></div>
              <span className="encrypted">安全会话</span>
            </div>
            {notice && <div className="notice" role="alert">{notice}</div>}
            <div className="message-list" aria-live="polite">
              {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
              {busy && <div className="thinking"><i /><i /><i /><span>Agent 正在评估</span></div>}
              <div ref={chatEndRef} />
            </div>
            {followUps.length > 0 && (
              <button className="quick-question" type="button" onClick={() => setInput(followUps[0])}>
                <span>待确认</span>{followUps[0]}
              </button>
            )}
            <form className="composer" onSubmit={sendMessage}>
              <label htmlFor="symptom-input" className="sr-only">描述症状或回答追问</label>
              <textarea id="symptom-input" value={input} onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }} placeholder="描述您的症状，或回答上方追问…" rows="2" />
              <button type="submit" disabled={!input.trim() || busy} aria-label="发送消息">↑</button>
            </form>
            <p className="disclaimer">本系统仅用于演示安全分流流程，不构成医疗诊断或治疗建议。</p>
          </div>

          <aside className="status-panel" aria-label="Agent 状态">
            <div className="status-heading"><div><p className="eyebrow">LIVE TRACE</p><h2>Agent 状态</h2></div><span className="live-dot">LIVE</span></div>
            <div className={`risk-card ${risk[1]}`}><small>当前风险等级</small><strong>{risk[0]}</strong><code>{snapshot?.riskLevel ?? "READY"}</code></div>
            <div className="state-list">
              <StateItem label="当前状态" value={currentAction} />
              <StateItem label="会话轮次" value={`${turnCount} 轮`} />
              <StateItem label="追问状态" value={followUps.length ? "等待用户回答" : "无需追问"} />
            </div>
            {followUps.length > 0 && <div className="followup-card"><small>FOLLOW-UP QUESTION</small><p>{followUps[0]}</p></div>}
            <KnowledgeCard knowledge={knowledge} />
            <div className="trace-card">
              <strong>安全决策链</strong>
              <ol><li className={turnCount ? "done" : "active"}>原文证据定位</li><li className={snapshot?.riskLevel !== "READY" ? "done" : ""}>语义门控</li><li className={snapshot?.riskLevel !== "READY" ? "done" : ""}>Safety Core 裁决</li><li className={knowledge?.status === "available" ? "done" : ""}>知识支持（只读）</li></ol>
            </div>
          </aside>
        </section>
      </main>
      <footer><span>Medical Agent MVP</span><span>Safety Core → Response Layer → Optional RAG</span></footer>
    </div>
  );
}

function ChatMessage({ message }) {
  if (message.role === "user") return <div className="message user"><p>{message.text}</p><small>您</small></div>;
  const response = message.response;
  return (
    <article className="message agent">
      <div className="mini-avatar">M</div>
      <div className="agent-message">
        <p>{response.summary}</p>
        {response.reasoning?.map((item) => <p className="muted" key={item}>{item}</p>)}
        {response.recommendedAction?.length > 0 && <ResponseList title="建议行动" items={response.recommendedAction} />}
        {response.warningSigns?.length > 0 && <ResponseList title="危险信号提示" items={response.warningSigns} warning />}
      </div>
    </article>
  );
}

function ResponseList({ title, items, warning = false }) {
  return <div className={`response-list ${warning ? "warning" : ""}`}><strong>{title}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function StateItem({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function KnowledgeCard({ knowledge }) {
  const status = knowledge?.status ?? "not_requested";
  const meta = KNOWLEDGE_META[status] ?? [status, "知识支持状态未知。"];
  return (
    <div className={`knowledge-card ${status}`}>
      <div className="knowledge-title"><span>⌁</span><div><small>KNOWLEDGE SUPPORT</small><strong>{meta[0]}</strong></div></div>
      <p>{meta[1]}</p>
      {knowledge?.snippets?.map((item) => <blockquote key={item.sourceId}>{item.text}</blockquote>)}
      {knowledge?.sources?.length > 0 && <div className="sources"><small>来源</small>{knowledge.sources.map((source) => <a key={source.sourceId} href={source.url} target="_blank" rel="noreferrer">{source.title}<span>↗</span></a>)}</div>}
    </div>
  );
}
