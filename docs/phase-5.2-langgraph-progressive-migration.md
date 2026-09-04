# Phase 5.2 — LangGraph.js 渐进迁移

## 1. 结论

Phase 5.2 让 LangGraph.js 在 feature flag 下接管 Fact Memory reconcile、Question Planner 和 Clinical Pathway pending question。默认生产行为仍为 `legacy`，既有 Memory Layer 和 Legacy Agent 均保留。

本阶段没有修改 Safety Core、Semantic Gate、Clinical Pathway 或风险判断规则。LangGraph 不能写医学事实、riskLevel、disposition 或 Semantic Gate decision；Phase 5 Pending Bridge 仅可把已批准问题的 id 同步到 CaseState `decisionState.pendingQuestionId`，以保证下一轮短回答关联正确。

## 2. Feature Flag

~~~dotenv
AGENT_ORCHESTRATOR=legacy
~~~

| 值 | 行为 | 用户回复来源 |
|---|---|---|
| `legacy` | 完全使用既有流程，不创建 Planner Graph | Legacy |
| `shadow` | 执行 Fact/Planner/去重对比，不写回 pending | Legacy |
| `langgraph` | 对批准的 Pathway 问题建立 canonical pending，并替换已回答字段的重复问题 | LangGraph Planner；异常时 Legacy |

非法值会在启动时以 `INVALID_AGENT_ORCHESTRATOR_MODE` 拒绝，避免配置拼写错误导致静默切换。

## 3. 实际流程

~~~text
Input
  → Legacy Multi-turn Loop
      → Semantic Extraction（不变）
      → Semantic Gate（不变）
      → Safety Core / Risk Decision（不变）
  → LangGraph Planner
      → reconcile_fact_memory
      → plan_question
      → deduplicate_question
      → 校验问题属于现有 Clinical Pathway
      → Phase 5 Pending Bridge 同步唯一 pendingClarification
  → Response Layer（不变）
  → LightRAG（不变）
~~~

Graph 位于 Risk Decision 之后、Response Layer 之前，只能调整 `ASK_MORE` 中的问题。`action`、`disposition`、`riskLevel`、危险信号和 closed 状态在 Graph 前后进行 fingerprint 比较；允许变化的唯一 CaseState 字段是 `decisionState.pendingQuestionId`。

## 4. State Schema

`Phase52PlannerState` 保存：

- `sessionId` 与 `clientTurnId`；
- CaseState 只读快照；
- Legacy decision 安全投影；
- 当前 `pendingClarification`；
- 从 CaseState 派生的 `factMemory`；
- `plannedQuestion` 与最终 `selectedQuestion`；
- Planner comparison、status 和去重 trace。

Graph 使用 `sessionId` 派生稳定的 `thread_id`。本阶段 Checkpointer 仍是进程内 `MemorySaver`；跨进程会话恢复继续由现有 `FileSessionManager` 负责，不删除、不迁移旧 checkpoint。

## 5. 去重与写回规则

`LEGACY_DUPLICATE` 仅表示 Legacy 问题的 `factPath` 已出现在 Fact Memory 的 `answeredFactPaths`。只有同时满足以下条件才允许替换：

1. 原决策仍是 `ASK_MORE`；
2. 下一问题由现有 Question Planner 选出；
3. id、factPath 和文本与现有 Clinical Pathway 完全一致；
4. 原问题不是 Semantic Gate 生成的语义澄清；
5. Graph 与 pending 同步均执行成功。

正常 `MATCH` 的 Pathway 问题也会写入 canonical pending，但用户看到的内容保持不变。Semantic Gate 的主体、否定、时态等澄清继续由 Legacy 持有，LangGraph 不得覆盖。

若没有可安全替换的问题、映射不完整、发生 Question Drift、Graph 异常或同步校验失败，系统返回原始 Legacy decision。

## 6. Legacy fallback

- `legacy` 是默认值和即时回滚开关；
- Shadow 不改变任何回复；
- LangGraph 异常只在 `orchestrator.fallbackReason` 中记录错误码；
- fallback 不降低或重算风险等级；
- 既有 `MemoryLayerAgent`、Fact Memory、Question Planner、FileSessionManager 全部保留。

## 7. 影响文件

~~~text
package.json / package-lock.json
.env.example
src/phase2b/multi-turn-agent-loop.js
src/phase5/create-phase5-agent.js
src/phase5/orchestrator-mode.js
src/phase5/langgraph-planner-state.js
src/phase5/langgraph-question-planner.js
src/phase5/planner-orchestrated-loop.js
src/phase5/planner-pending-bridge.js
src/index.js
test/phase-5.2-langgraph-migration.test.js
test/phase-5.1-langgraph-shadow.test.js
docs/phase-5.2-langgraph-progressive-migration.md
README.md / docs/quick-start.md / docs/phase-5-memory-layer.md
~~~

## 8. 测试方案

- Feature flag 合法值与非法值；
- Shadow 只对比、不写回；
- LangGraph 替换已回答 factPath 的重复问题；
- 40 条 duplicate benchmark；
- Graph/Checkpointer 异常返回 Legacy 原始临床字段；
- Semantic Gate 澄清不被 Planner 覆盖；
- 成年人范围问题仅允许固定文本与 factPath；
- Pending Bridge 替换后，短回答只写入新问题对应事实；
- 真实 Legacy / Shadow / LangGraph 普通追问一致；
- 真实高风险胸痛的 action、disposition、riskLevel、redFlags 和 decisionState 一致；
- Phase 1 Safety Invariants 保持 10/10；
- Safety Core、Semantic Gate、Clinical Pathway 保持冻结哈希。

## 9. 后续迁移计划

1. 默认保持 `legacy`，在开发和演示环境运行 `shadow` 收集 MATCH、DUPLICATE、DRIFT、fallback 指标；
2. 指标稳定后，仅对本地 Demo 开启 `langgraph`；
3. 增加跨进程 durable checkpointer 前，不移除 FileSessionManager；
4. durable checkpoint 与旧会话迁移验证完成后，再评估扩大流量；
5. Safety Core 和 Semantic Gate 始终不迁移到 LangGraph 决策权限内。

## 10. 当前验证结果

- Phase 5.2 定向测试：12/12；
- duplicate benchmark：Legacy 40/40 重复，LangGraph 0/40 重复；
- Node.js：312/312；
- Python：19/19；
- Phase 5.1 Shadow prototype：6/6；
- React：8/8；
- Phase 1 Safety Invariants：10/10；
- Vite production build：通过。
