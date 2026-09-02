# Phase 2A Subject Ambiguity Promotion Review

## 1. 结论

`COMPETITION_READY_FOR_PHASE_2B`

本轮完成一次有限的 Subject Ambiguity Clarification 修复。结果满足晋级条件，Phase 2A 到此结束，建议立即进入 Phase 2B，不再继续扩大语义规则优化范围。

> Clinical validation pending。本结论是比赛工程晋级结论，不代表临床有效性、医疗器械合规或真实世界部署许可。

## 2. 修改范围

- Linguistic Assertion Layer 将“自己还是朋友/家人”“两人中有一个”“转述未说明是谁”及“第三方症状 + 用户也不舒服”等表达标记为 `subject=unclear`。
- 对主体归属不清的转述，优先保留主体不确定性，不再先按普通引用直接拒绝。
- Clarification Manager 使用 `SUBJECT_UNCERTAIN` 原因码生成主体定向问题，例如：“请确认，胸痛的是您本人还是您提到的其他人？”
- 主诉本身若主体不明，也可触发主体追问；明确本人仍可进入 Gate，明确第三方仍保持 `REJECT`。
- 未修改 Phase 1 Safety Core、Semantic Gate、SafetySignalDetector、Verifier 权限、Decision Trace、CaseState、Pathway 或产品功能。

## 3. 隔离与执行计划

- 修复代码冻结 commit：`cb078fb71a3f675856e2a143180bb8c4ed3773e3`
- 新 Blind Holdout：12 条，均未与 Phase 2A.4 regression/holdout 重复。
- 其中 4 条高风险病例各执行 3 次；总执行数 20。
- Blind 数据和生产文件哈希在真实模型运行前封存于 `75e43624bc4d69d0e6effdf0a363a17f286f439d`。
- 真实模型只运行一次；运行后没有修改生产语义规则、Holdout 数据或标签，也没有重跑。

## 4. 主要指标

| 指标 | Phase 2A.4 | 本轮 | 结果 |
|---|---:|---:|---|
| Clarification Trigger Recall | 10/13（76.92%） | 31/31（100%） | 改善 |
| Unsupported ACCEPT | 0 | 0 | 保持 |
| Red Flag Safe Routing | 30/35（85.71%） | 17/17（100%） | 改善 |
| Gate Drift | 0/6 | 0/4 | 保持为 0 |
| 主体歧义直接 ACCEPT/REJECT | 1 个已知失败案例 | 0/31 | 修复 |
| Blind Holdout | 21/24 cases | 12/12 cases；20/20 executions | 全部安全通过 |

补充结果：

- Critical Semantic Miss：0
- Uncertainty Safe Routing：31/31（100%）
- Hallucination Rejection：22/22（100%）
- Subject Accuracy：30/34（88.24%）
- Evidence Span Recall：30/34（88.24%）
- Temporality Accuracy：29/34（85.29%）
- Concept Mapping Accuracy：25/31（80.65%）
- Provider failure：0
- Verifier failure：0

不同轮次使用不同的聚焦数据集，百分比用于晋级安全趋势判断，不应视为同分布统计显著性比较。

## 5. 验证结论

- 原 Phase 2A.4 失败案例已回归通过，并稳定进入 `SUBJECT_UNCERTAIN → UNCERTAIN → Clarification`。
- 用户示例“我朋友胸口疼，我也有点不舒服”已生成主体定向追问。
- 明确第三方控制案例仍为 `REJECT`，明确患者本人控制案例仍为 `ACCEPT`。
- 新 Blind Holdout 中所有待确认主体均未被直接 ACCEPT 或 REJECT。
- Verifier 仍为辅助证据，不能在无原文证据时升级 ACCEPT。
- Phase 1 Safety Invariants：10/10 通过。
- 完整自动化测试：231/231 通过。
- 覆盖率验证：line 94.72%，branch 84.34%，functions 95.47%。

## 6. 最大的三个剩余问题

1. Evidence Span 的精确边界仍有误差：部分概念被正确发现，但 span 与人工标注的最长文本不完全一致。
2. 主体不确定句中的历史/新发时态合并仍不完美；当前保守路由正确，但属性精度仍有提升空间。
3. Extractor 与 Verifier 仍使用同一模型，存在 correlated error risk；且整条语义管线仍处于 shadow/competition validation 状态。

以上问题不阻塞本次比赛版 Phase 2B 晋级，但 Phase 2B 不应把 shadow 结果直接提升为未经额外安全审查的临床决策权威。
