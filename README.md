# Medical-Agent

> **安全约束多轮医疗 Agent｜Safety-Constrained Multi-turn Medical AI Agent**

[![Release](https://img.shields.io/github/v/release/ggggddddhhh/Medical-Agent?include_prereleases&label=release)](https://github.com/ggggddddhhh/Medical-Agent/releases)
[![CI](https://github.com/ggggddddhhh/Medical-Agent/actions/workflows/ci.yml/badge.svg)](https://github.com/ggggddddhhh/Medical-Agent/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Research Prototype](https://img.shields.io/badge/status-research%20prototype-orange.svg)](#限制与适用边界)

Medical-Agent 是一个面向医疗安全智能体架构研究的 **research prototype**。它不回答“你得了什么病”，而是基于用户明确表达的证据、受控的多轮追问和独立的安全裁决，帮助用户理解下一步应采取什么行动。

它将语言模型能力放在受约束的位置：

- **LangGraph.js** 负责 Agent 流程编排、状态传递、Checkpoint 与追问规划；
- **Safety Core** 是唯一的风险等级与处置建议裁决来源；
- **Memory Layer** 保存会话、已确认事实和待追问字段，不拥有临床决策权；
- **LightRAG** 仅提供可追溯的健康教育知识与来源，不能改变风险结论；
- **React Demo UI** 让评委直观看到多轮状态、风险结果、Memory 和 RAG 边界。

> [!WARNING]
> 本项目是工程研究与比赛展示原型，不是医疗器械，不提供诊断、处方或个性化用药建议，也不能替代医生或急救服务。出现紧急症状时，请立即联系当地急救服务。

![Medical-Agent React Demo](docs/images/react-web-demo.png)

## Overview（项目定位）

真实医疗对话通常是不完整、含糊且多轮的。普通聊天机器人可能重复提问、混淆“患者本人”和“他人”的症状、将推测当成事实，或让知识检索结果反向影响风险判断。

Medical-Agent 尝试用一套可验证的分层架构处理这些问题：

1. 从用户原话中定位 Evidence Span；
2. 判断主体、否定、确定性、时态、引用、假设和后续纠正；
3. 仅将有证据支持的内容映射为 Clinical Fact；
4. 由 Semantic Gate 保守地执行 ACCEPT、UNCERTAIN 或 REJECT；
5. 由 Safety Core 独立完成风险分级与 Clinical Pathway 路由；
6. 由 LangGraph 和 Memory 规划下一轮问题，避免重复追问；
7. 在不影响风险结论的前提下，由 LightRAG 补充健康教育材料和来源。

当前 MVP 面向成人场景，仅覆盖 HEADACHE_V1 与 CHEST_PAIN_V1 两条 Clinical Pathway。它适用于安全智能体架构研究、语义 Gate 评测和比赛展示；不适用于真实患者数据处理或临床部署。

## Architecture（系统架构）

### 职责边界

~~~mermaid
flowchart TB
    U[用户] --> UI[React Demo UI]
    UI --> API[Node.js Demo API]
    API --> LG[LangGraph Orchestrator]

    subgraph O[编排与状态层]
        LG[LangGraph Orchestrator<br/>仅负责编排、Checkpoint、状态传递]
        MEM[Memory Layer<br/>Session、Fact、Question Ledger]
        LG <--> MEM
    end

    LG --> SG[Semantic Gate]
    SG --> CS[CaseState]
    CS --> SC[Safety Core<br/>唯一风险决策来源]
    SC --> CP[Clinical Pathway]
    CP --> RL[Response Layer]
    RL --> UI

    RL -. 只读知识请求 .-> RAG[Python LightRAG Service<br/>仅知识解释与来源]
    RAG --> EMB[BAAI/bge-m3 Embedding API]
    RAG -. 只读 Context 与 Sources .-> RL

    classDef authority fill:#0f766e,color:#ffffff,stroke:#0f766e;
    classDef support fill:#eff6ff,color:#1e3a8a,stroke:#60a5fa;
    class SC authority;
    class LG,MEM,RAG,EMB support;
~~~

### 运行链路

~~~mermaid
sequenceDiagram
    participant U as 用户
    participant UI as React UI
    participant LG as LangGraph
    participant M as Memory Layer
    participant G as Semantic Gate
    participant S as Safety Core
    participant R as LightRAG

    U->>UI: 输入症状或补充信息
    UI->>LG: 发送同一 sessionId 的消息
    LG->>M: 恢复会话、对齐已确认事实
    LG->>G: 解析并审核候选事实
    G->>S: 仅传入受支持的状态
    S-->>LG: 风险等级与下一步安全动作
    LG->>M: 记录事实、问题账本与 Checkpoint
    opt 需要健康教育材料
        LG->>R: 请求只读知识 Context
        R-->>LG: Context 与 Sources，不含风险裁决
    end
    LG-->>UI: 受约束的用户回复与追问
~~~

| 模块 | 负责什么 | 明确不负责什么 |
| --- | --- | --- |
| LangGraph Orchestrator | 状态流转、Checkpoint、Fact Memory reconcile、Question Planner | 风险判断、Clinical Pathway 改写、知识结论裁决 |
| Memory Layer | sessionId、历史消息、CaseState 快照、已回答字段、待确认问题 | 诊断、风险升级或降级 |
| Semantic Gate | 证据与语言属性审核，执行 ACCEPT / UNCERTAIN / REJECT | 直接输出 disposition |
| Safety Core | 唯一的 riskLevel、红旗路由与最终安全处置来源 | RAG 检索、界面展示、自由生成诊断 |
| LightRAG | 医学知识解释、参考来源、健康教育 Context | 修改 CaseState、修改 riskLevel、覆盖 Safety Core |

Node.js Agent Core 持有 CaseState、Semantic Gate、Safety Core、Clinical Pathway、Decision Trace 与 Response Layer。Python 服务通过 HTTP 隔离：Python AI Service 支持模型辅助提取，Python LightRAG Service 只提供知识支持。

更多边界说明见 [architecture.md](docs/architecture.md) 与 [phase-5-memory-layer.md](docs/phase-5-memory-layer.md)。

## Design Philosophy（设计理念）

### 先找证据，再形成事实

任何已知 Clinical Fact 都应能回溯到用户原话中的 Evidence Span。没有原文证据时，即使外部模型或 Verifier 表示支持，也不能被升级为 ACCEPT。

### 不确定时追问，而不是猜测

对于主体不明、时态不明、否定冲突或高风险信息不足的情况，系统优先进入 UNCERTAIN 并提出针对性问题。错误事实进入 ACCEPT 的风险，高于正确事实暂时停留在 UNCERTAIN。

### 状态是产品能力，不是聊天记录

Memory Layer 保存的不是一段“对话文本”，而是可恢复的 sessionId、CaseState 快照、Fact Memory、Question Ledger 与 pending clarification。Question Planner 用这些状态过滤已回答字段，减少重复追问。

### 编排权、裁决权与知识权必须分离

LangGraph 可以安排流程，但不能裁决风险；LightRAG 可以解释医学知识，但不能改变风险等级；只有 Safety Core 可以产生最终安全决策。这种分离使系统能在模型、RAG 或 Checkpoint 失败时安全降级。

### 可审计优先于不可解释的智能

Decision Trace 记录结构化事件、证据引用和状态变化，不保存隐藏思维链。评测重点包括 Unsupported ACCEPT、Red Flag Safe Routing、Clarification Trigger 与 Gate Drift，而不是单纯追求回复自然度。

## Key Features（核心能力）

| 能力 | 面向中文开发者的价值 |
| --- | --- |
| **Evidence Span Finder** | 先从用户原话定位精确证据，降低模型凭空补全 Clinical Fact 的风险。 |
| **Linguistic Assertion Layer** | 分离 subject、polarity、certainty、temporality、quote、hypothetical 与 correction，避免语言歧义直接进入安全决策。 |
| **Conservative Semantic Gate** | 用 ACCEPT / UNCERTAIN / REJECT 管理事实准入；无证据或冲突信息不会静默升级。 |
| **Safety Core** | 作为唯一风险裁决模块，优先处理 Red Flag，并保持风险单调性。 |
| **LangGraph Orchestration** | 统一 Fact Memory reconcile、Question Planner、pending clarification 与 Checkpoint 恢复。 |
| **Multi-turn Memory** | 在同一 session 中恢复历史、CaseState、已确认事实和问题账本。 |
| **Duplicate Question Prevention** | 追问前过滤已回答字段；未知或冲突信息仍允许合理澄清。 |
| **Response Layer** | 将内部结构化裁决转为用户可读回复，同时不重新诊断、不绕过 Gate。 |
| **LightRAG Knowledge Support** | 以 BAAI/bge-m3 为 Embedding，返回小规模医学知识库的只读 Context 与 Sources。 |
| **React Demo UI** | 展示聊天、多轮追问、风险等级、CaseState、Safety Core、Memory、Trace 与 RAG 来源。 |

AGENT_ORCHESTRATOR 默认值为 langgraph；legacy 模式保留为 fallback，shadow 模式可用于 Planner 对比。

## Safety Design（安全设计）

- **LangGraph 只负责编排。** 它可以管理节点执行、状态传递和 Checkpoint，但不能改写 riskLevel、disposition 或 Clinical Pathway。
- **Safety Core 独立且唯一。** 红旗识别后的风险结论、最终行动建议与安全升级只由 Node.js Safety Core 产生。
- **Semantic Gate 决定事实准入。** 引用他人、假设表达、明确否定、时态不匹配、无 Evidence Span 或多轮冲突的内容不能被直接接受。
- **高风险信息优先澄清。** 当主体、确定性或时态影响风险判断而无法确认时，系统应生成 clarification，而不是强行 ACCEPT 或 REJECT。
- **RAG 严格只读。** LightRAG 请求不携带患者原文、CaseState 或风险结论；RAG 返回不能修改任何安全裁决。
- **故障保持安全。** 模型、Embedding、LightRAG、LangGraph 或 Checkpoint 异常时，系统保留既有安全响应，并在适用时回退 Legacy Orchestrator。
- **Decision Trace 可检查。** 记录的是结构化决策事件和证据关联，不包含隐藏思维链。

## Demo（Demo 展示）

React Demo 采用三栏布局，便于比赛演示时同时观察用户体验与内部状态：

- 左侧：固定 Demo Case 与 Session History；
- 中间：用户消息、Agent 回复和多轮 Clarification Card；
- 右侧：riskLevel、CaseState、Safety Core、Semantic Gate、Memory、Agent Trace、RAG 状态与知识来源。

| Demo Case | 预期安全行为 | RAG 行为 |
| --- | --- | --- |
| 普通头痛 | 在完成必要澄清后进入 SELF_MONITOR | 可选头痛健康教育 |
| 模糊胸痛 | 信息不足时优先 Clarification；必要时 URGENT_SAME_DAY | 可选胸痛知识说明 |
| 高风险胸痛 | 立即进入 EMERGENCY_NOW，不等待普通追问或 RAG | 不阻塞安全升级 |

演示顺序与讲解脚本见 [Demo Guide](docs/demo-guide.md)。

## Quick Start（快速开始）

### 前置条件

- Git
- Node.js 22+
- Python 3.11+（推荐 Python 3.12）
- 用于 Python AI Service 的 DeepSeek API Key
- 支持 OpenAI-compatible 协议、输出维度为 1024 的 BAAI/bge-m3 Embedding Endpoint

### 1. 克隆并安装依赖

~~~powershell
git clone https://github.com/ggggddddhhh/Medical-Agent.git
cd Medical-Agent

npm ci
npm ci --prefix web

py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r python_knowledge_service/requirements.txt
~~~

macOS/Linux 请使用 python3 -m venv .venv，再使用 .venv/bin/python 安装 Python 依赖。

### 2. 配置环境变量

~~~powershell
Copy-Item .env.example .env
Copy-Item web/.env.example web/.env
~~~

至少在根目录 .env 中配置：

~~~dotenv
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com

EMBEDDING_BASE_URL=https://your-provider.example/v1
EMBEDDING_API_KEY=your-key
EMBEDDING_MODEL=BAAI/bge-m3

AGENT_ORCHESTRATOR=langgraph
~~~

不要提交 .env、web/.env、API Key、runtime Checkpoint 或真实患者数据。环境文件和 runtime 数据均已被 Git 忽略。完整配置见 [.env.example](.env.example) 与 [web/.env.example](web/.env.example)。

### 3. 启动完整 Demo

分别在四个终端中运行，并保持进程持续运行：

~~~powershell
npm run start:python-ai
npm run start:python-knowledge
npm run start:demo
npm run start:web
~~~

| 服务 | 默认地址 | 作用 |
| --- | --- | --- |
| React Web Demo | http://127.0.0.1:5173 | 比赛展示界面 |
| Python AI Service | http://127.0.0.1:8001 | 模型辅助语义提取 |
| Python LightRAG Service | http://127.0.0.1:8002 | 只读医学知识检索 |
| Node.js Demo API | http://127.0.0.1:8003 | Agent Core 与 Demo API |

浏览器打开 <http://127.0.0.1:5173>。首次启动 LightRAG 时会在已忽略的 runtime/lightrag 下建立本地索引。

### 4. 健康检查与验证

~~~powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8002/health
Invoke-RestMethod http://127.0.0.1:8003/health

npm run test:all
~~~

配置真实 Embedding 后，可运行 LightRAG 闭环 smoke test：

~~~powershell
npm run test:rag:live
~~~

完整操作与故障排查见 [docs/quick-start.md](docs/quick-start.md)。

## Evaluation（验证结果）

以下为仓库自动化验证基线，不代表临床有效性、监管合规或真实世界部署结论：

| 验证范围 | 结果 |
| --- | ---: |
| Node.js tests | **326/326 passed** |
| Python tests | **19/19 passed** |
| LangGraph Phase 5.1 prototype | **6/6 passed** |
| React tests | **8/8 passed** |
| Phase 1 Safety Invariants | **10/10 passed** |

语义稳健性验证重点覆盖 Evidence Span、主体识别、否定、确定性、时态、Clarification Trigger、Critical Semantic Miss、Unsupported ACCEPT、Red Flag Safe Routing 与 Gate Drift。详细数据见 [Phase 2A.4](docs/phase-2a4-competition-semantic-repair.md)、[Subject Promotion](docs/phase-2a-subject-promotion.md) 与封存的 [evaluation results](evaluation/results/deepseek-v4-flash-phase-2a-promotion.json)。

Phase 2A 的比赛工程检查点为 COMPETITION_READY_FOR_PHASE_2B；这是一项工程验证里程碑，不是临床验证或上线许可。

## Project Structure（目录结构）

~~~text
.
├── src/                         Node.js Agent Core、Safety Core、Pathway 与 API
├── python_ai_service/           Python 模型传输服务
├── python_knowledge_service/    LightRAG、Embedding 与医疗知识库
├── web/                         React + Vite Demo UI
├── evaluation/                  封存数据集与脱敏评测结果
├── test/                        Node.js 自动化测试
├── scripts/                     启动、评测与 smoke test 脚本
├── docs/                        架构、使用、Demo 与验证文档
└── .github/workflows/           GitHub Actions 配置
~~~

## 限制与适用边界

- 当前 MVP 仅覆盖少量成人场景 Clinical Pathway。
- 输出是安全路由与健康教育回复，不是诊断、处方或治疗方案。
- 本地 Checkpoint 包含会话数据；任何受控部署前都需要额外的加密、访问控制与数据保留策略。
- 现有评测集是工程验证资产，不能替代临床、监管、隐私或可用性验证。
- 请勿将本仓库用于处理可识别的真实患者数据。

## Security and Privacy（安全与隐私）

- 不要提交 .env、API Key、runtime Checkpoint、原始日志或可识别健康数据。
- RAG 请求与患者原文、CaseState、风险结论隔离。
- RAG 或模型失败时不会编造知识，原始 Safety Core 响应会被保留。
- 安全问题请按 [SECURITY.md](SECURITY.md) 中的方式私密报告。

## Contributing（贡献）

提交改动时请同时补充相关测试和文档，并在提交前运行完整验证。每个独立改动应对应一个 Git commit，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License（许可证）

本项目采用 [Apache License 2.0](LICENSE)。许可证不改变项目的安全边界：Medical-Agent 是 research prototype，不是医疗器械或诊断工具。
