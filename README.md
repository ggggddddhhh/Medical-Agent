# Medical Safety Agent MVP

这是一个面向成年人的、限定症状范围的安全分诊与就医准备智能体内核。目前仅支持：

- 头痛（`HEADACHE_V1`）
- 胸痛（`CHEST_PAIN_V1`）

系统回答的问题是“下一步应采取什么行动”，而不是“患了什么病”。当前版本不提供诊断、处方、个性化药物剂量、儿童问诊或长期病史管理。

## 核心能力

- Session 级结构化 `CaseState`
- 按临床路径动态选择下一项问题
- 出现危险信号时立即停止普通追问
- 只读白名单工具调用
- 输入和输出安全门
- 结构化 `Decision Trace`，不记录隐藏思维链
- 确定性协议与完整回归测试

## 快速运行

```powershell
npm test
npm run test:coverage
```

## 最小示例

```js
import { MedicalSafetyAgent } from "./src/index.js";

const agent = new MedicalSafetyAgent({ deploymentRegion: "CN" });
const sessionId = agent.startSession({ adultConfirmed: true });

const first = agent.handleMessage(sessionId, "我头很痛");
const second = agent.handleMessage(sessionId, "突然一下就非常痛，是最严重的一次");

console.log(first.question?.text);
console.log(second.disposition); // EMERGENCY_NOW
```

## 安全边界

智能体只允许在以下动作之间转换：

- `ASK_MORE`
- `CALL_TOOL`
- `DISPOSITION`
- `SAFETY_ESCALATION`
- `OUT_OF_SCOPE`
- `INSUFFICIENT_INFO`

协议、规则、模型和工具版本都会写入审计轨迹。新增症状路径时，必须同时增加对应的正常路径、危险信号、语义改写、越界和工具失败测试。

## Phase 1 验证

- [Safety Invariants](docs/safety-invariants.md)
- [Phase 1 Core Validation Report](docs/phase-1-validation-report.md)

当前验证结论为 **PASS_WITH_CONDITIONS**：可以有条件进入 LLM 结构化语义抽取集成，但不能据此开始临床部署、扩展症状范围或宣称已经验证自然语言理解能力。

## Phase 2A Semantic Extraction

- [Phase 2A Semantic Extraction Design](docs/phase-2a-semantic-extraction-design.md)
- [Phase 2A Evaluation Report](docs/phase-2a-evaluation-report.md)
- [DeepSeek V4 Flash Real-Model Evaluation](docs/phase-2a-real-model-evaluation.md)

Phase 2A 提供严格的 pathway-specific Extraction Schema、可注入的真实 LLM provider、独立 Shadow Evaluation Log、24 条 Gold Cases、8 条 Semantic Sentinels 和 10 项语义评测指标。LLM candidate 不会更新 CaseState，也不会改变 Phase 1 的 disposition、state transition 或工具调用。

Phase 2A 已完成 Evidence-Grounded Assertion Pipeline、语义鲁棒性与独立 Holdout 验证，最终结论为 **COMPETITION_READY_FOR_PHASE_2B**。该结论仅用于比赛工程晋级，仍不代表临床验证或真实世界部署许可。

## Phase 2B Multi-turn Agent Loop

- [Phase 2B Architecture and API](docs/phase-2b-multi-turn-agent-loop.md)

Phase 2B 在未修改 Safety Core、Semantic Gate、CaseState 和 Clinical Pathway 的前提下增加多轮编排与 REST 边界。Node.js 仍是状态和安全决策权威；Python AI Service 只负责模型调用，为后续 RAG、Embedding 和 Retriever 预留独立服务边界，本阶段尚未加入这些功能。

## Phase 2C Response Layer

- [Phase 2C Architecture and Safety Contract](docs/phase-2c-response-layer.md)

Phase 2C 以只读包装器把现有结构化决策转换为固定的用户响应字段，并再次经过响应安全门。风险等级、处置、原因码、CaseState 和 Decision Trace 仍由原 Node.js Core 独占；本阶段没有接入 RAG，也没有让生成层新增医学事实或修改风险结论。

## Phase 3 Python LightRAG Knowledge Service

- [Phase 3 Architecture and Safety Contract](docs/phase-3-lightrag-knowledge-service.md)
- [Phase 3.1 Real Embedding & Retrieval Validation](docs/phase-3-1-real-embedding-validation.md)

Phase 3 新增独立 Python LightRAG 服务，固定使用 `BAAI/bge-m3`（1024 维、8192 tokens）进行知识检索。RAG 只返回经审核的一般医学解释、健康教育片段和来源；Node.js 继续独占 CaseState、风险判断与安全裁决。知识服务失败、无结果或返回越权字段时，系统保留原始安全回复并停止知识增强。

Phase 3.1 使用 `EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY` 和 `EMBEDDING_MODEL=BAAI/bge-m3` 完成真实索引、检索与 Node.js → Python 联调。配置完成后可运行 `npm run test:rag:live` 验证完整闭环。

## Phase 4 Demo 与端到端展示

- [Phase 4 Demo Architecture and Usage](docs/phase-4-demo.md)

Phase 4 在现有 Agent 外增加独立 Demo HTTP 层，提供普通头痛、模糊胸痛和高风险胸痛三个固定案例，也支持使用同一个 sessionId 进行自由多轮交互。Demo 与 RAG 均不能修改 CaseState 或风险裁决。

## React Web Demo

- [React Web Demo Architecture and Usage](docs/react-web-demo.md)

比赛展示界面位于独立的 web/ React + Vite 应用，通过 /api 代理调用 Phase 4 Demo API。它提供自由多轮聊天、三个固定案例、风险与追问状态、RAG 调用状态和来源展示，不直接访问或修改 Node.js 临床核心。

~~~powershell
npm run start:demo
npm run start:web
~~~

浏览器打开 http://127.0.0.1:5173。
