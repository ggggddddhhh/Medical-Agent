# Phase 5.1 — LangGraph.js Orchestrator Prototype

## 1. 状态与目标

Phase 5.1 的状态是 `SHADOW_PROTOTYPE_ONLY`。本阶段引入隔离的 LangGraph.js StateGraph 原型，用于验证统一状态、节点编排、thread checkpoint 和重复追问对比；生产 Demo 仍由现有 `MemoryLayerAgent` 返回结果。

本阶段不修改 Safety Core、Semantic Gate、Clinical Pathway、Response Layer、Python AI Service 或 LightRAG，也不删除 FileSessionManager、FactMemory、QuestionPlanner 和 MemoryLayerAgent。

## 2. 接入方式

原型位于独立子包 `prototypes/phase5-orchestrator/`，LangGraph.js 仅是该子包依赖，不进入根项目 production dependencies。

~~~text
用户输入
  ↓
Legacy Phase 5 Agent ─────────────────────────────→ 用户回复（唯一生效结果）
  │
  └─ 脱敏结构化响应 + CaseState 快照
       ↓
     LangGraph Shadow Thread
       capture_turn
          ↓
       reconcile_fact_memory
          ↓
       plan_question
          ↓
       compare_legacy
          ↓
     Shadow Report（MATCH / drift，不写回 Legacy）
~~~

`LangGraphShadowOrchestrator` 实现与 Legacy Agent 相同的主要接口，但 `handleMessage()` 总是先取得并最终返回 Legacy response。Shadow Graph 失败时只产生 `shadow_error` 报告，不能阻断或修改医疗回复。

## 3. State Schema

| 字段 | 用途 | 更新规则 |
|---|---|---|
| `schemaVersion` | Graph checkpoint 版本 | 固定版本 |
| `sessionId` | 对应既有医疗 Session | last value |
| `clientTurnId` | 单轮关联与 trace 去重标识 | last value |
| `messageDigest` | 输入关联校验，不保存原文 | last value |
| `caseState` | Legacy CaseState 只读快照 | last value |
| `legacyResponse` | 脱敏后的 action/question/trace 投影 | last value |
| `pendingClarification` | Legacy 当前待确认问题 | last value |
| `factMemory` | 从 CaseState 派生的事实记忆 | reconcile 节点覆盖 |
| `plannedQuestion` | Planner 根据最新事实选择的问题 | planner 节点覆盖 |
| `comparison` | Legacy 与 Planner 对比结果 | compare 节点覆盖 |
| `shadowStatus` | 当前 Shadow 阶段 | last value |
| `traceEvents` | 去重后的节点事件 | reducer 按事件 ID 合并 |

Graph State 不含用户输入原文、模型 prompt、隐藏推理或 API Key。当前 prototype 使用 `MemorySaver`，只用于进程内测试，不作为生产持久化方案。

## 4. Node 映射

### capture_turn

- 校验 graph sessionId 与 CaseState sessionId；
- 接收 Legacy 输出的只读投影；
- 不调用模型，不修改 CaseState。

### reconcile_fact_memory

- 直接复用现有 `FactMemory.snapshot()`；
- CaseState 是唯一事实来源；
- 不接受 Graph 自行生成的医疗事实。

### plan_question

- 直接复用现有 `QuestionPlanner.plan()`；
- 在 Shadow 中计算按最新 Fact Memory 应选择的问题；
- 当前阶段不替换 Legacy response。

### compare_legacy

输出：

- `MATCH`：Legacy 与 Planner 的 questionId/factPath 一致，或都没有问题；
- `LEGACY_DUPLICATE`：Legacy 问题对应 factPath 已经 answered；
- `QUESTION_DRIFT`：两侧选择了不同的完整问题；
- `INCOMPLETE_MAPPING`：问题缺少 factPath，无法安全比较。

任何非 MATCH 结果只记录为 migration telemetry，不参与临床决策。

目标生产 Graph 的节点映射已经作为 `PHASE_52_TARGET_NODE_MAPPING` 固化，顺序为：

~~~text
accept_input
  → semantic_extract
  → semantic_gate
  → safety_core
  → reconcile_fact_memory
  → plan_question
  → clarification_interrupt 或 response_guard
  → knowledge_support
~~~

其中只有 `safety_core` 节点可以写 `caseState` 和 `coreDecision`；Shadow 阶段不会执行该目标 Graph。

## 5. Safety 权限

| 模块 | 权限 |
|---|---|
| Safety Core | 风险等级与 disposition 唯一来源 |
| Semantic Gate | ACCEPT / UNCERTAIN / REJECT 唯一语义裁决来源 |
| Clinical Pathway | 现有问题与医学规则来源 |
| Legacy Agent | Phase 5.1 唯一用户回复来源 |
| Shadow Graph | 编排验证和差异报告，无写回权限 |
| LightRAG | 风险裁决后的只读知识支持 |

Shadow 仅持有 `structuredClone` 后的 CaseState。执行前后会比较 Legacy CaseState fingerprint；发生异常时标记 Shadow 失败，Legacy 回复保持不变。

## 6. 后续迁移计划

### Phase 5.1A — 当前阶段

- 完成 StateGraph、State Schema、Node Mapping；
- 使用 MemorySaver 验证 thread checkpoint；
- 使用可控偏差夹具和真实 Legacy Agent 做对比；
- 不接入 `createPhase5Agent()`，不切换生产流程。

### Phase 5.1B — Shadow 集成

- 在明确配置开关下把 Shadow runner 接到预发布 Demo；
- Legacy 继续返回结果；
- 只记录结构化 comparison，不记录患者原文；
- 统计 Question Match、Legacy Duplicate、Question Drift 和 Shadow Error。

### Phase 5.2 — Planner 前置

- 将唯一 `pendingQuestion` 放入 Graph State；
- Planner 在 Response Layer 前执行；
- 已回答 factPath 必须重新规划，不能进入用户回复；
- clarification 使用 checkpoint/interrupt 恢复，不再重放全部模型请求；
- 保留 Legacy feature flag 和回滚路径。

### Phase 5.3 — Durable Checkpointer

- 测试使用 MemorySaver；
- 本地 Demo 评估 SQLite checkpointer；
- 生产评估 PostgreSQL checkpointer；
- FileSessionManager 保留为旧 checkpoint 的只读导入来源；
- 禁止 Legacy 与 LangGraph 长期双写同一 Session。

## 7. 影响文件

当前新增或修改范围：

~~~text
package.json
prototypes/phase5-orchestrator/package.json
prototypes/phase5-orchestrator/package-lock.json
prototypes/phase5-orchestrator/src/*
prototypes/phase5-orchestrator/test/*
test/phase-5.1-langgraph-shadow.test.js
docs/phase-5.1-langgraph-shadow.md
docs/phase-5-memory-layer.md
~~~

明确不修改：

~~~text
src/engine/
src/domain/
src/semantic/
src/protocols/
src/phase2b/
src/phase2c/
src/phase3/
src/phase4/
src/phase5/
~~~

## 8. 测试方案

- StateGraph 和四个节点映射存在；
- MATCH 路径保持 Legacy response 对象不变；
- 已回答 factPath 的旧问题被标记为 `LEGACY_DUPLICATE`；
- Planner 只选择现有 Clinical Pathway 的下一问题；
- 同一 thread 跨两轮累计确定性 trace/checkpoint；
- Shadow Graph 故障不影响 Legacy 回复；
- 真实 Phase 5 Agent 的胸痛两轮流程与 Shadow 匹配；
- Shadow state 不包含用户消息原文；
- Safety Core、Semantic Gate 和 Pathway 保持字节级不变；
- 根生产依赖和 `createPhase5Agent()` 保持 Legacy。

当前验证结果：Node.js 300/300、LangGraph prototype 6/6、Python 19/19、React 8/8、Phase 1 Safety Invariants 10/10，Vite 生产构建通过。

## 9. 当前限制

- Shadow 只能检测重复，暂时不会修正用户回复；
- MemorySaver 不能跨进程恢复；
- 尚未实现 interrupt/resume；
- 尚未做生产并发、持久化加密和旧 checkpoint 导入；
- 在 Phase 5.2 之前，状态多源问题仍存在于生产 Legacy 流程。
