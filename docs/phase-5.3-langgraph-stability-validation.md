# Phase 5.3 — LangGraph Stability Validation

## 结论

- Validation Verdict：`PASS_WITH_CONDITIONS`
- 默认编排器建议：`KEEP_LEGACY_DEFAULT`
- `AGENT_ORCHESTRATOR` 默认值仍为 `legacy`
- Legacy fallback 保留
- Safety Core、Semantic Gate、Clinical Pathway 和风险裁决逻辑均未修改

LangGraph Planner 已证明能够在当前受支持的头痛、胸痛 Pathway 中消除“已回答字段再次被询问”的问题，并且没有造成风险等级、处置建议或正常问题顺序漂移。但当前有效 Planner 覆盖仍只有两个疾病路径，本轮也未包含并发、压力和真实模型长时间运行验证，因此暂不建议直接修改生产默认配置。可在 Demo 或预发布环境显式设置 `AGENT_ORCHESTRATOR=langgraph` 继续观察。

## 验证范围

本轮使用离线、确定性验证，不调用真实外部模型，不修改任何医学规则。

| 验证项 | 数量 | 结果 |
| --- | ---: | --- |
| Duplicate Question / Question Drift 基准 | 39 | 通过 |
| Session Resume | 2 | 2/2 通过 |
| Safety Regression | 3 | 3/3 通过 |
| Failure Fallback | 3 | 3/3 通过 |
| Fact Memory Consistency | 6 | 6/6 通过 |

39 条问题基准由以下部分组成：

- 20 条已回答字段重复追问挑战：头痛 10、胸痛 10；
- 10 条正常问题一致性检查：头痛 5、胸痛 5；
- 9 条未支持 Pathway 边界检查：发热、咳嗽、腹痛各 3。

发热、咳嗽和腹痛当前没有 Clinical Pathway。本报告只验证 Legacy 与 LangGraph 均保持 `OUT_OF_SCOPE` 且不生成自由追问，不把这些病例计入 Duplicate Question Rate 分母。

## Legacy vs LangGraph

| 指标 | Legacy | LangGraph | 结论 |
| --- | ---: | ---: | --- |
| Duplicate Question Rate | 20/20，100% | 0/20，0% | LangGraph 消除全部注入的已回答字段重复问题 |
| Question Drift | — | 0/19，0% | 正常问题和未支持边界均无意外漂移 |
| 受控问题替换 | — | 20/20 | 仅在确认 Legacy 问题对应字段已回答时替换 |
| 未支持 Pathway 一致性 | 9/9 | 9/9 | 两种模式均安全退出，不自由追问 |

这里的 Question Drift 不把受控的重复问题替换视为漂移；其分母为 10 条正常受支持 Pathway 用例与 9 条未支持边界用例。

## Session Resume Stability

头痛和胸痛各执行一次进程级恢复。恢复前后逐项比较持久化 checkpoint，并在恢复后继续回答下一题。

| 字段 | 一致结果 |
| --- | ---: |
| `sessionId` | 2/2 |
| `caseState` | 2/2 |
| `factMemory` | 2/2 |
| `pendingQuestion` | 2/2 |
| `questionLedger` | 2/2 |

恢复后的问题推进也保持正确：

- 头痛：`HEADACHE_ONSET` → `HEADACHE_NEURO`；
- 胸痛：`CHEST_PAIN_BREATHING` → `CHEST_PAIN_PRESSURE`。

## Safety Regression

| 场景 | Legacy | LangGraph | Drift |
| --- | --- | --- | ---: |
| 高风险胸痛 | `EMERGENCY_NOW` | `EMERGENCY_NOW` | 0 |
| 模糊胸痛完成追问 | `URGENT_SAME_DAY` | `URGENT_SAME_DAY` | 0 |
| 普通头痛完成追问 | `SELF_MONITOR` | `SELF_MONITOR` | 0 |

- Risk Drift：`0/3`
- Disposition Drift：`0/3`
- Safety Core 仍是风险判断唯一来源；LangGraph 只处理 Fact Memory reconcile、Question Planner 与 pending question 同步。

## Failure Fallback

| 注入故障 | Fallback | 安全结果 |
| --- | --- | --- |
| Graph 执行异常 | Legacy | `EMERGENCY_NOW` 保持一致 |
| Checkpoint 异常 | Legacy | `EMERGENCY_NOW` 保持一致 |
| Planner 异常 | Legacy | `EMERGENCY_NOW` 保持一致 |

3/3 故障均进入 Legacy fallback；Safety Core 结果未被异常降低或覆盖。

## Fact Memory Consistency

- `known`：2/2 均跳过已回答字段并进入下一唯一问题；
- `unknown`：2/2 保留原问题，允许合理澄清；
- `conflicting`：2/2 保留原问题，允许解决冲突；
- 总计：6/6 通过。

## 是否切换默认值

当前建议：`KEEP_LEGACY_DEFAULT`。

这不是安全回归失败，而是发布证据范围仍有限：

1. 只有头痛和胸痛真正进入 LangGraph Question Planner；
2. 发热、咳嗽、腹痛仅验证为未支持边界，不能证明新增 Pathway 后的 Planner 表现；
3. 尚未执行并发写入、压力、长会话和真实模型 soak test。

建议先在 Demo/预发布环境显式启用 `langgraph`，收集无敏感内容的编排指标；扩展 Pathway 前后分别补充相同基准，再决定是否修改默认配置。

## 复现

```bash
npm run eval:phase5.3
npm test
npm run test:python
npm run test:orchestrator
npm run test:web
npm run build:web
```

机器可读结果位于 `evaluation/results/phase-5.3-langgraph-stability.json`。
