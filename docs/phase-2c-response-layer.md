# Phase 2C — Response Layer

## 1. 阶段结论

Phase 2C 在现有 Multi-turn Agent Loop 之外增加只读响应包装层，将结构化风险裁决转换为用户可理解的固定结构。CaseState、Semantic Gate、Safety Core、Clinical Pathway、Decision Trace 和最终风险裁决均未修改。

本阶段没有接入 RAG、LightRAG、Embedding、Retriever、UI、新 Pathway 或新模型。

## 2. 架构

```text
User input
   │
   ▼
Phase 2B Multi-turn Agent Loop
   │  Semantic Gate + same CaseState + Safety Core
   ▼
Authoritative Risk Decision
   │  read-only snapshot
   ▼
Phase 2C ResponseGenerator
   │  canonical user response
   ▼
ResponseSafetyGuard
   │  decision/state consistency + existing Output Safety
   ▼
User-facing REST response
```

`ResponseLayerAgent` 使用包装器模式代理 Phase 2B 的 session、state、audit 和 trace 方法。它只在每轮已有决策之后生成展示字段，不参与语义抽取、事实写入、状态转换、Pathway 选择或 disposition 计算。

## 3. 响应结构

REST 消息响应保留已有的 `action`、`disposition`、`reasonCodes`、`decisionTraceId`、`semantic` 和 `pendingClarification`，并新增：

```json
{
  "riskLevel": "EMERGENCY_NOW | URGENT_SAME_DAY | CLINIC_SOON | SELF_MONITOR | INSUFFICIENT_INFORMATION | ASK_MORE | OUT_OF_SCOPE",
  "summary": "用户可读摘要",
  "reasoning": ["基于既有安全规则的简短解释"],
  "recommendedAction": ["下一步行动"],
  "warningSigns": ["危险信号或升级提示"],
  "followUpQuestions": ["下一项真实追问"]
}
```

- `riskLevel` 必须逐值复用 Core 的 `disposition`；无 disposition 时复用 Core 的 `action`，不建立第二套风险判定。
- `summary` 逐字复用已通过原 Output Safety 的 Core `message`。
- `recommendedAction` 和 `warningSigns` 复用 Core 的 `guidance` 与 `warnings`。
- `followUpQuestions` 只能复用当前 Core question 或 Semantic Clarification，不能自行追加问诊问题。
- `reasoning` 是按 Core action/disposition 生成的受控说明，不暴露隐藏思维链，也不声称患者具有新的医学事实。

## 4. 新增模块

| 文件 | 职责 |
|---|---|
| `src/phase2c/response-generator.js` | 从权威 decision 生成固定六字段响应 |
| `src/phase2c/response-safety-guard.js` | 校验固定结构、canonical 内容、风险与 CaseState 一致性，并复用 Output Safety |
| `src/phase2c/response-layer-agent.js` | 只读包装 Phase 2B Loop，检测生成期间 CaseState 变化 |
| `src/phase2c/create-phase2c-agent.js` | 装配 Phase 2B 与 Phase 2C，不改变原工厂 |
| `src/phase2c/knowledge-support-boundary.js` | 声明未来 LightRAG 的允许与禁止权限，当前禁用 |
| `evaluation/phase-2c-core-freeze-manifest.js` | 冻结核心和 Phase 2B 编排文件哈希 |

生产启动入口继续使用原 Node Agent API，只把内部 loop 装配为 `createPhase2CAgentLoop`。API 路径、Python AI Service 边界和模型均未改变。

## 5. 安全约束

1. Response Generator 不调用模型，不诊断，不生成处方或剂量。
2. 候选响应必须与 canonical 响应逐字段一致；任意风险降级、升级、改写或附加事实都会被拒绝。
3. 非空 disposition 必须与同 session 的 `CaseState.decisionState.disposition` 一致。
4. 所有用户可见文本再次经过现有 `validateOutput`，急症回复仍必须包含可执行的急救指引。
5. Response Layer 仅收到 decision 和 CaseState 的深拷贝；生成前后状态指纹变化会触发 `CASE_STATE_MUTATION`。
6. 原始 `reasonCodes`、Core/Loop Decision Trace ID 保持不变，Response Layer 不创建替代裁决。
7. Semantic Gate 的 `REJECT` 或 `UNCERTAIN` 不能被 Response Layer 转换为已确认事实。

## 6. 未来 Python LightRAG 边界

`FUTURE_LIGHTRAG_BOUNDARY` 当前为 `enabled: false`。后续服务只允许返回一般医学知识解释和来源引用；禁止返回或修改 riskLevel、disposition、action、reasonCodes、CaseState 和患者 Clinical Fact。任何未来知识解释仍须在 Node Response Safety 之后接受独立安全校验。

## 7. 验证范围

自动化测试覆盖：

- 六字段响应结构与真实追问复用；
- 急症风险、原因、行动和警示完整保留；
- 风险篡改、额外医学事实、诊断文本和 CaseState 不一致被拒绝；
- 生成期间的状态变更被检测；
- Phase 2B 多轮 session 与 REST API 集成；
- LightRAG 权限边界保持禁用；
- 核心及 Phase 2B 编排文件哈希冻结；
- Phase 1 Safety Invariants 继续作为阻断式门禁。

最终验证命令：

```powershell
npm run test:all
npm run test:coverage
```

最终结果：

- Node.js：258/258 tests passed。
- Python AI Service：4/4 tests passed。
- Phase 1 Safety Invariants：10/10 passed。
- 覆盖率：line 94.12%，branch 82.98%，functions 94.10%。
