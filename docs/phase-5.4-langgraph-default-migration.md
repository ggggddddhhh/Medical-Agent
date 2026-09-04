# Phase 5.4 — LangGraph Default Migration Report

## Migration Verdict

`LANGGRAPH_DEFAULT`

Phase 5.4 将 `AGENT_ORCHESTRATOR` 的运行时默认值和公开环境变量模板从 `legacy` 切换为 `langgraph`。Legacy 实现、显式 `legacy` 模式和异常时的 Legacy fallback 均完整保留。

## 变更范围

- 默认运行时解析：`langgraph`；
- `.env.example`：`AGENT_ORCHESTRATOR=langgraph`；
- README 和 Quick Start 更新为新的默认启动方式；
- 新增默认启动、Pathway、风险漂移、fallback 和 Session Resume 回归测试。

未修改：

- Safety Core；
- Semantic Gate；
- Clinical Pathway；
- Response Layer；
- Python LightRAG Service；
- 风险等级和处置规则。

## 默认流程

```text
Input
  → Semantic Gate / Legacy clinical pipeline
  → Fact Memory reconcile
  → LangGraph Question Planner
  → approved pendingQuestion synchronization
  → Response Layer
```

LangGraph 只接管 Phase 5.2 已批准的 Fact Memory reconcile、Question Planner 和 pending question 同步。Safety Core 仍是风险判断的唯一来源。

## Legacy fallback

以下回退能力保持不变：

- 显式设置 `AGENT_ORCHESTRATOR=legacy` 可直接使用 Legacy 流程；
- `shadow` 模式仍可用于只读对比；
- Graph、Checkpoint 或 Planner 抛出异常时，返回同一轮已经生成的 Legacy 临床结果；
- fallback 不降低或覆盖 Safety Core 的风险决定。

## 验证结果

### 默认配置启动

- 无 `AGENT_ORCHESTRATOR` 环境变量时解析为 `langgraph`；
- 默认创建的 Phase 5 Agent 返回 `orchestrator.mode=langgraph`；
- 显式 `legacy` 仍可启动并产生相同的首个 Pathway 问题。

### Headache Pathway

完整通过 6 个现有问题：

1. `HEADACHE_ONSET`
2. `HEADACHE_NEURO`
3. `HEADACHE_FEVER_NECK`
4. `HEADACHE_CONSCIOUSNESS`
5. `HEADACHE_TRAUMA`
6. `HEADACHE_SEVERITY`

最终结果与 Legacy 一致：`SELF_MONITOR`。

### Chest Pain Pathway

完整通过 5 个现有问题：

1. `CHEST_PAIN_BREATHING`
2. `CHEST_PAIN_PRESSURE`
3. `CHEST_PAIN_RADIATION`
4. `CHEST_PAIN_COLLAPSE`
5. `CHEST_PAIN_ACTIVE`

普通胸痛最终与 Legacy 一致：`URGENT_SAME_DAY`；高风险胸痛保持 `EMERGENCY_NOW`。

### Risk Drift

| 场景 | Legacy | 默认 LangGraph | Risk Drift |
| --- | --- | --- | ---: |
| 普通头痛 | `SELF_MONITOR` | `SELF_MONITOR` | 0 |
| 普通胸痛 | `URGENT_SAME_DAY` | `URGENT_SAME_DAY` | 0 |
| 高风险胸痛 | `EMERGENCY_NOW` | `EMERGENCY_NOW` | 0 |

总计：Risk Drift = `0/3`，Disposition Drift = `0/3`。

### 异常回退

模拟默认 LangGraph 不可用后：

- 自动使用 Legacy response；
- `orchestrator.status=fallback`；
- `orchestrator.responseSource=legacy`；
- 高风险胸痛仍为 `EMERGENCY_NOW`。

### Session Resume

跨进程恢复验证通过：

- `sessionId` 一致；
- `caseState` 一致；
- `factMemory` 一致；
- `pendingQuestion` 一致；
- `questionLedger` 一致；
- 恢复后从 `CHEST_PAIN_BREATHING` 正确推进到 `CHEST_PAIN_PRESSURE`。

## 运行方式

默认：

```dotenv
AGENT_ORCHESTRATOR=langgraph
```

手动回退：

```dotenv
AGENT_ORCHESTRATOR=legacy
```

修改配置后需要重启 Node.js Demo API。

## 剩余运行风险

- LangGraph 的 `MemorySaver` 不是生产级共享持久化存储，跨进程恢复仍由 Phase 5 File Session Manager 负责；
- 当前 Planner 只覆盖头痛和胸痛两个 Clinical Pathway；
- 多实例、并发 checkpoint 与长时间真实模型运行仍需后续运行监控。
