# Phase 2B — Multi-turn Agent Loop

## 1. 阶段结论

Phase 2B 已打通可执行的多轮闭环：语义提取、Semantic Gate、同一 `CaseState` 更新、真实 Clarification、用户补充回答、再次 Gate，以及 Safety Core 重新评估。

本阶段没有加入 RAG、Embedding、Retriever、知识库、UI、新 Pathway 或 LangChain，也没有重写经过验证的 Node.js 核心。

Phase 1 Safety Invariants 必须继续保持 10/10；这是 Phase 2B 的阻断式门禁。

## 2. 架构变化

```text
Client
  │  REST /v1/sessions/:id/messages
  ▼
Node.js Agent API
  │
  ├─ MultiTurnAgentLoop ── Clarification context / Loop Trace
  │          │
  │          ├─ SemanticExtractor + existing Hybrid Semantic Validator
  │          │        │
  │          │        └─ HTTP /v1/model/responses
  │          │                    ▼
  │          │              Python AI Service
  │          │                    └─ DeepSeek model transport
  │          │
  │          └─ ACCEPT only ── CoreSessionBridge ── same serialized CaseState
  │                                           │
  └───────────────────────────────────────────▼
                       unchanged MedicalSafetyAgent / Safety Core
```

新增 Node 模块位于 `src/phase2b/`。`CoreSessionBridge` 使用原有 `exportSession`、`restoreSession` 和 `mergeFacts`，保持 `sessionId` 与既有状态；它不复制 Clinical Pathway 或策略规则。Phase 2B 另建结构化 Loop Trace，并引用原 Core Decision Trace ID。

受保护核心文件在 `evaluation/phase-2b-core-freeze-manifest.js` 中记录哈希，测试会阻止以下模块被无意修改：

- `MedicalSafetyAgent`、policy engine、state machine；
- `CaseState` 与常量；
- Semantic Gate、SafetySignalDetector；
- 头痛与胸痛 Pathway；
- 输入/输出 Safety Core 与原审计日志。

## 3. Node.js 与 Python 服务边界

| 能力 | Node.js Agent Core | Python AI Service |
|---|---|---|
| Session / CaseState | 唯一所有者 | 不保存、不更新 |
| Extraction prompt / JSON Schema | 唯一所有者 | 透明转发 |
| Evidence / language attributes / concept mapping | 执行 | 不执行 |
| Semantic Gate | 唯一裁决者 | 无权限 |
| Clarification 状态机 | 执行 | 无权限 |
| Safety Core / Pathway / disposition | 唯一权威 | 禁止输出和修改 |
| Decision Trace | Core Trace + Loop Trace | 不记录患者原文 |
| 模型调用 | 通过 HTTP 请求 | DeepSeek transport |
| 后续 RAG / Embedding / Retriever | 定义接口和安全边界 | 后续阶段实现，本阶段未加入 |

Node 进程不向 Python 发送 `DEEPSEEK_API_KEY`。密钥只存在于 Python 服务环境。Python 返回模型结构化文本与最小元数据，不返回处置，也不能直接调用 Node 工具。

## 4. API 设计

### 4.1 面向客户端的 Node Agent API

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/health` | Node API 健康状态 |
| `POST` | `/v1/sessions` | 创建会话；body 为 `{ "context": {...} }` |
| `POST` | `/v1/sessions/{sessionId}/messages` | 提交一轮 `{ "message": "..." }` |
| `GET` | `/v1/sessions/{sessionId}` | 获取同一 CaseState 与待追问项 |
| `GET` | `/v1/sessions/{sessionId}/traces` | 获取不含原文的 Phase 2B Loop Trace |

消息响应沿用 `action`、`disposition`、`reasonCodes`、`question` 和 `decisionTraceId`，并新增：

- `coreDecisionTraceId`：原 Safety Core trace，可为空；
- `semantic.gateSummary`：本轮 `ACCEPT / UNCERTAIN / REJECT` 数量；
- `semantic.decisions`：仅含 fact path、Gate 决策和原因码；
- `pendingClarification`：下一轮需要回答的真实问题。

同一 session 的并发 turn 返回冲突错误，避免两个回答竞争写入同一个 CaseState。请求体上限为 64 KiB，响应禁用缓存。

### 4.2 Node 到 Python AI Service

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/health` | Python 服务健康状态 |
| `POST` | `/v1/model/responses` | 执行 Node 提供的结构化模型请求 |

请求包含 `model`、`message`、`systemInstruction`、`jsonSchema` 和 `schemaName`。响应为：

```json
{
  "serviceVersion": "python-ai-service-0.1.0",
  "outputText": "{...}",
  "metadata": {
    "responseId": "...",
    "modelSnapshot": "deepseek-v4-flash",
    "responseStatus": "completed"
  }
}
```

Python 服务使用标准库实现，当前没有新增第三方 Python 依赖。

## 5. 多轮追问流程

1. 输入安全规则先行；自伤、提示注入、诊断和用药边界仍交给原 Core 处理。
2. Node 根据当前 CaseState 或本轮输入选择已有 Pathway。
3. Node 通过 Python 服务执行 Semantic Extraction，并在 Node 内进行 Schema 验证。
4. 现有 Evidence Pipeline 与 Semantic Gate 生成 `ACCEPT / UNCERTAIN / REJECT`。
5. `ACCEPT` 的 known fact 才能通过 bridge 合并到同一个 CaseState；`REJECT` 不写状态。
6. 只要存在带追问的 `UNCERTAIN`，优先返回该问题并保存 pending clarification，不把它降级成建议文本。
7. 下一轮用户可以给出完整陈述，也可以只回答“是我本人”“是朋友”“有/没有”。回答再次经过 Extraction/Gate；短回答由受限 Clarification Resolver 与上一轮原文证据组合后，再调用原 Semantic Gate。
8. 接受的补充事实写回原 session；随后调用未修改的 Safety Core 重新评估。新确认的高风险事实会立即触发 `SAFETY_ESCALATION`。
9. 原 Clinical Pathway 产生的问题仍由原 `fact-extractor` 解析，回答继续写入同一个 CaseState。

如果 Python 服务超时、不可用、返回非法 JSON 或 Schema 无效，Loop 不采用模型候选，退回原 Phase 1 确定性 Core。本阶段没有让 Python 失败阻断已验证的急症识别。

## 6. 运行方式

配置 `.env.example` 中的环境变量后，分别启动：

```powershell
npm run start:python-ai
npm run start:agent-api
```

测试：

```powershell
npm run test:all
npm run test:coverage
```

## 7. 当前限制

- Session 与 pending clarification 仍为进程内存状态，尚未接入数据库或分布式锁。
- HTTP 服务尚未加入鉴权、TLS、限流和生产级可观测性；只适合本地/受控环境验证。
- Python 服务会把当前用户语句发送给配置的外部模型，正式部署前必须完成隐私、数据驻留和供应商协议评审。
- Clarification Resolver 当前只处理主体确认和受限的是/否短回答；复杂自由文本仍依赖完整 Semantic Extraction。
- 本阶段是工程闭环验证，不代表临床有效性或真实世界部署许可。

## 8. 验证结果

- Node.js：246/246 tests passed。
- Python AI Service：4/4 tests passed。
- Phase 1 Safety Invariants：10/10 passed。
- 覆盖率：line 94.37%，branch 83.22%，functions 94.54%。
- 验证覆盖主体确认、短回答高风险确认、明确第三方拒绝、Core 原生问题续答、Core 问题期间的主体歧义抢占、防状态污染、模型服务故障回退、REST API 与去原文 Loop Trace。
- 未向外部 DeepSeek 发送真实健康文本进行 live smoke；该操作需要单独的敏感数据出站授权。Node/Python 两侧 HTTP 契约均已用受控 gateway 自动验证。
