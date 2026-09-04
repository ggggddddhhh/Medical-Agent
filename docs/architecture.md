# Medical-Agent 架构说明

## 1. 设计原则

Medical-Agent 将“临床安全裁决”和“概率型 AI 能力”隔离：

- Node.js Agent Core 是 CaseState、风险等级、Clinical Pathway、Safety Core 和 Decision Trace 的唯一权威；
- Python AI Service 只负责把 Node.js 提供的请求发送给模型，不拥有临床策略；
- Python LightRAG Service 只提供审核知识片段与来源，不参与诊断或风险判断；
- React Web Demo 只调用公开 Demo API，不直接导入或修改核心模块。

当模型、Embedding、LightRAG 或工具不可用时，系统保留确定性安全决策，并明确显示降级状态。

## 2. 系统组件

~~~mermaid
flowchart TB
    subgraph Client[展示层]
        UI[React + Vite Web Demo :5173]
    end

    subgraph Node[Node.js 决策层]
        API[Phase 4 Demo API :8003]
        MEMORY[Phase 5 Memory Layer]
        CHECKPOINT[(Local Session Checkpoints)]
        LOOP[Multi-turn Agent Loop]
        EXTRACT[Evidence + Assertion Pipeline]
        GATE[Semantic Gate]
        STATE[CaseState]
        CORE[Safety Core]
        PATH[Clinical Pathway]
        RESPONSE[Response Layer + Safety Guard]
        TRACE[Decision Trace]
    end

    subgraph Python[Python AI 服务层]
        MODEL[AI Service :8001]
        RAG[LightRAG Knowledge Service :8002]
        KB[Approved Mini Knowledge Base]
        EMBED[BAAI/bge-m3 Embedding API]
        LLM[DeepSeek Responses API]
    end

    UI -->|HTTP /api| API
    API --> MEMORY
    MEMORY --> LOOP
    MEMORY -. sessionId / history / CaseState snapshots .-> CHECKPOINT
    LOOP --> EXTRACT
    EXTRACT --> GATE
    GATE --> STATE
    STATE --> CORE
    CORE --> PATH
    PATH --> RESPONSE
    RESPONSE --> API
    CORE --> TRACE
    GATE --> TRACE

    EXTRACT -. 结构化模型调用 .-> MODEL
    MODEL -. 无状态传输 .-> LLM
    RESPONSE -. 仅健康教育查询 .-> RAG
    RAG --> KB
    RAG --> EMBED
    RAG -. 知识检索生成 .-> LLM
~~~

## 3. 一次请求的数据流

~~~text
用户输入
  → Evidence Span Finder 定位原文证据
  → Linguistic Assertion 判断主体/否定/确定性/时态
  → Concept Mapper 映射既有 Clinical Facts
  → Semantic Gate 输出 ACCEPT / UNCERTAIN / REJECT
  → CaseState 更新或触发 Clarification
  → Safety Core 与 Clinical Pathway 作出风险裁决
  → Response Layer 生成受约束回复
  → 非急诊且策略允许时请求 RAG
  → Knowledge Guard 校验来源后组合展示
~~~

UNCERTAIN 会进入真实多轮追问。用户回答后，系统继续使用同一个 sessionId 和同一份 CaseState，并重新执行安全评估。

Phase 5 在主流程外保存会话检查点。进程重启后，未完成追问通过原流程重放并进行 CaseState 完整性校验；Memory 不直接注入医疗事实或修改风险结果。

## 4. 服务边界

| 组件 | 可以做 | 禁止做 |
| --- | --- | --- |
| React Web | 展示消息、状态、来源；提交用户输入 | 计算风险、写 CaseState、绕过 API |
| Demo API | 会话与固定案例编排 | 新增医学事实或改变 Safety Core |
| Memory Layer | 保存历史、CaseState 快照、已确认事实投影和问题记录 | 直接写 CaseState、改变风险、绕过 Gate |
| Python AI | 模型传输、返回结构化候选 | 持久化 CaseState、决定风险 |
| LightRAG | 检索审核知识、返回来源 ID | 诊断、修改 riskLevel、覆盖安全回复 |
| Semantic Gate | 依据证据保守裁决事实 | 因 Verifier 单独支持而升级 ACCEPT |
| Safety Core | 最终风险与动作裁决 | 被 RAG、UI 或模型输出覆盖 |

## 5. 端口与接口

| 服务 | 端口 | 主要接口 |
| --- | ---: | --- |
| React Web | 5173 | Vite 页面与 /api 代理 |
| Python AI | 8001 | GET /health、POST /v1/generate |
| Python Knowledge | 8002 | GET /health、POST /v1/knowledge/query |
| Node Demo API | 8003 | GET /health、案例与多轮 session API |

Web 开发服务器把 /api 代理到 8003；Demo API 分别通过 PYTHON_AI_SERVICE_URL 和 PYTHON_KNOWLEDGE_SERVICE_URL 调用两个 Python 服务。

## 6. 安全不变量

- 明确危险信号必须升级，且紧急状态不能被普通后续输入降级；
- 高风险不确定信息优先追问，不强行 ACCEPT；
- 没有患者原文证据的 known fact 不得进入 CaseState；
- Verifier 只能提供辅助证据，不能单独升级事实；
- 工具或 RAG 失败不能降低风险等级；
- Response Layer 不能添加 CaseState 不支持的患者医学事实；
- Decision Trace 结构化保存版本和结果，不保存隐藏推理。

完整定义见 [Safety Invariants](safety-invariants.md)。

## 7. 扩展方式

新增前端展示、模型供应商或知识来源时，应保持 HTTP 边界并补充失败降级测试。新增 Clinical Pathway 属于安全核心变更，必须单独设计、验证并更新冻结清单，不能通过 RAG 或提示词间接加入。
