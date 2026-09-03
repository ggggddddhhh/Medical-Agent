# Phase 4 — Demo 与端到端展示

## 1. Demo 架构

```text
Demo HTTP API（Node.js，端口 8003）
  → DemoApplication
     → Phase 3 KnowledgeEnrichedAgent
        → Phase 2C Response Layer
           → Phase 2B Multi-turn Loop
              → Semantic Gate / CaseState / Safety Core / Clinical Pathway
        → Python LightRAG Knowledge Service（仅在策略允许时）
```

Phase 4 只新增案例目录、Demo 编排和 HTTP 路由。它不解释医学语义，不读写临床事实，也不修改风险规则。既有 Safety Core、Semantic Gate、CaseState、Multi-turn Loop 和 Response Layer 继续拥有全部临床决策权。

## 2. 使用方式

先配置已有的 DeepSeek 与 Embedding 环境变量，然后分别启动：

```powershell
npm run start:python-ai
npm run start:python-knowledge
npm run start:demo
```

默认地址为 `http://127.0.0.1:8003`，可通过 `DEMO_API_HOST` 和 `DEMO_API_PORT` 调整。

### 查看固定案例

```http
GET /v1/demo/cases
```

### 一键回放案例

```http
POST /v1/demo/cases/ordinary-headache/run
```

响应包含每轮用户输入、每轮安全响应、最终响应，以及固定预期是否匹配。

### 自由多轮会话

```http
POST /v1/demo/sessions
Content-Type: application/json

{"context":{"adultConfirmed":true}}
```

```http
POST /v1/demo/sessions/{sessionId}/messages
Content-Type: application/json

{"message":"我头痛"}
```

使用同一个 `sessionId` 继续回答 `followUpQuestions`，Agent 会更新同一份 CaseState。

## 3. 固定演示案例

| 案例 | 轮数 | 现有规则的预期结果 | RAG |
| --- | ---: | --- | --- |
| 普通头痛 | 7 | `SELF_MONITOR` | 最终处置后提供头痛健康教育 |
| 模糊胸痛 | 6 | `URGENT_SAME_DAY` | 最终处置后提供胸痛健康教育 |
| 高风险胸痛 | 1 | `EMERGENCY_NOW` | 不请求 RAG，立即返回急救提示 |

模糊胸痛案例仅表示症状描述不具体，Agent 仍使用既有胸痛路径逐项追问；没有增加新的语义规则或风险规则。

## 4. API

- `GET /health`：Demo API 健康状态；
- `GET /v1/demo/cases`：固定案例目录；
- `POST /v1/demo/cases/{caseId}/run`：一键完整回放；
- `POST /v1/demo/sessions`：创建交互式会话；
- `POST /v1/demo/sessions/{sessionId}/messages`：提交一轮用户输入；
- `GET /v1/demo/sessions/{sessionId}`：读取当前会话状态。

所有 HTTP 响应使用 `Cache-Control: no-store`。Demo context 只允许可选布尔字段 `adultConfirmed`。

## 5. 安全约束

- Demo 层不能直接更新 CaseState 或生成 disposition；
- RAG 请求仍不包含患者原文、CaseState 或风险结论；
- 急诊结果不调用 RAG；
- RAG 异常时只把 `knowledgeSupport.status` 标记为 `unavailable`，原始风险、原因、行动建议和 CaseState 不变；
- 所有用户回复仍由 ResponseSafetyGuard 和 Output Safety 校验；
- 固定案例是工程演示，不构成诊断、临床验证或部署许可。

## 6. 验证

自动化端到端测试覆盖三个固定案例、多轮状态延续、HTTP 路由、RAG 不改变裁决、RAG 异常安全降级、急诊不调用 RAG，以及 Response 输出安全约束。

```powershell
npm run test:all
npm run test:coverage
```

验证结果：

- Phase 4 专项测试：8/8；
- 完整 Node.js 测试：279/279；
- Python 测试：19/19；
- Phase 1 Safety Invariants：10/10；
- Node.js 覆盖率：行 93.57%、分支 82.48%、函数 93.60%。
