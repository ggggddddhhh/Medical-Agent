# Phase 2A.3 — Evidence-Grounded Clinical Assertion Pipeline

## 结论

- **Verdict：FAIL**
- **Phase 2B：NOT_READY**
- 临床状态：Clinical validation pending

证据优先流水线显著降低了同一评测语料上的 Critical Semantic Miss、Unsupported ACCEPT 和 Gate 漂移，并继续阻止 Verifier 在无证据时把事实升级为 `ACCEPT`。但新独立 Holdout 只通过 24 / 40，Evidence Span Recall 仅 50.88%，当前实现仍不能安全泛化到新的口语、错别字和混合隐晦表达，因此不得进入 Phase 2B。

## 架构改造

Phase 2A.3 将语义链路改为：

`用户文本 → Evidence Span Finder → Linguistic Assertion Layer → Concept Mapper → Conversation Reconciler → Clarification Manager → Semantic Gate`

核心约束如下：

1. `Evidence Span Finder` 只接受能在患者原文中逐字验证的 evidence span；没有原文证据的 known fact 不得 `ACCEPT`。
2. `Linguistic Assertion Layer` 分离判断 subject、polarity、certainty、temporality、quote、hypothetical 和 explicit correction。
3. `Concept Mapper` 只把已定位并完成语言属性判断的证据映射到现有 Clinical Facts，没有新增 Red Flag。
4. `SafetySignalDetector` 仅发现医学概念候选，不直接决定 Clinical Fact 或 Disposition。
5. `Conversation Reconciler` 保留旧值和 Decision Trace；只有带原文依据的明确纠正才可覆盖旧事实。
6. `Clarification Manager` 对主体、时态、确定性或冲突不清的高风险候选生成针对性追问。
7. Verifier 仅作辅助证据，不能单独升级事实；本次 348 个 `SUPPORTED` 判定中，无 evidence 而被 Gate 接受的次数为 0。

## 评测隔离

本次评测包含 24 条 Gold、8 条原始 Sentinel、8 条 Phase 2A.1 Sentinel、60 条开发语义变体、40 条保留的 Phase 2A.2 Holdout 和 40 条全新 Blind Holdout，共 180 个病例。每个病例运行 3 次，共 540 次真实 `deepseek-v4-flash` 执行。

隔离顺序：

1. 生产语义实现先冻结于 commit `768073578cc999dd61449c864444121831d58049`。
2. 冻结后才创建新的 40 条 Blind Holdout；其规范化 SHA-256 为 `a65552cfc79c817ca8a6005cbbed3e7dba927f89be0d502ab2c627b75c74b4dd`。
3. Holdout 与评测协议封存于 commit `63070fb`，随后才进行首次真实运行。
4. 本报告使用首次且唯一一次真实 Holdout 结果；运行后未调整任何生产语义文件，也未重跑该 Holdout。
5. 结果文件不保存患者原文、系统提示、推理过程、Authorization 或 API Key。

Extractor 和 Verifier provider failure 均为 0。540 次提取调用全部完成，其中 75 次模型输出未通过结构校验；这属于结构化输出稳定性问题，而不是服务不可用。

## 同语料前后对比

为避免新增 40 条 Holdout 扩大分母造成误导，前后变化使用 Phase 2A.2 的同一批 140 个病例、420 次执行计算。

| 指标 | Phase 2A.2 | Phase 2A.3 同语料 | 变化 |
| --- | ---: | ---: | ---: |
| Critical Semantic Miss | 126 | 51 | -75（-59.52%） |
| Unsupported ACCEPT | 45 / 196（22.96%） | 27 / 318（8.49%） | -18；比例下降 14.47 个百分点 |
| Red Flag Safe Routing | 132 / 264（50.00%） | 213 / 264（80.68%） | +81；提升 30.68 个百分点 |
| 保留 Holdout 病例通过 | 12 / 40（30.00%） | 18 / 40（45.00%） | +6；提升 15 个百分点 |

说明：Phase 2A.3 同语料的 51 次 Critical Semantic Miss 和 27 次 Unsupported ACCEPT 均来自保留 Holdout；Gold、两组 Sentinel 和 60 条开发变体上的这两项均为 0。这证明已知语料回归改善明显，但不能证明对未知表达的泛化。

## 当前完整结果

| 指标 | 180 个病例 / 540 次执行 |
| --- | ---: |
| Critical Semantic Miss | 102 |
| Unsupported ACCEPT | 42 / 399（10.53%） |
| Red Flag Safe Routing | 264 / 360（73.33%） |
| Uncertainty Safe Routing | 42 / 51（82.35%） |
| Hallucination Rejection | 272 / 344（79.07%） |
| Legacy Sentinel | 24 / 24 executions（100%） |
| Phase 2A.1 Sentinel | 24 / 24 executions（100%） |
| 保留 Holdout | 18 / 40 cases（45.00%） |
| 新 Blind Holdout | 24 / 40 cases（60.00%） |
| Verifier Accuracy | 361 / 536（67.35%） |
| Extractor Clinical Semantic Drift | 21 / 180 cases（11.67%） |
| Gate Clinical Semantic Drift | 3 / 180 cases（1.67%） |

新 Blind Holdout 单独产生 51 次 Critical Semantic Miss 和 15 次 Unsupported ACCEPT；Red Flag Safe Routing 为 51 / 96（53.13%），Uncertainty Safe Routing 为 12 / 12（100%），Hallucination Rejection 为 90 / 102（88.24%）。

## 语言属性模块

以下为新 Blind Holdout 的端到端模块指标。未找到 evidence span 时，下游 subject、polarity、certainty、temporality 和 mapping 也按失败计入，因此这些数值反映整条证据链的实际可用性，而不是仅对成功定位样本的条件准确率。

| 模块 | 结果 |
| --- | ---: |
| Evidence Span Recall | 87 / 171（50.88%） |
| Subject Accuracy | 84 / 171（49.12%） |
| Negation Accuracy | 87 / 171（50.88%） |
| Certainty Accuracy | 81 / 171（47.37%） |
| Temporality Accuracy | 69 / 171（40.35%） |
| Concept Mapping Accuracy | 66 / 141（46.81%） |
| Clarification Trigger Recall | 21 / 24（87.50%） |

新 Holdout 的 16 个失败病例包含全部 4 条口语、全部 4 条错别字和全部 4 条混合隐晦表达，另有否定、时态和纠正各类失败。说明主要瓶颈已经从“模型生成事实后补救”转移到“能否先找到真实证据并正确解释”，但该瓶颈尚未解决。

## Verifier 与语义漂移

Verifier 准确率由 Phase 2A.2 的 257 / 431（59.63%）提升到 361 / 536（67.35%），但 Extractor 与 Verifier 仍使用同一个模型，相关错误风险依然存在。安全边界保持有效：Verifier 给出 `SUPPORTED` 不能覆盖 evidence、主体、否定、时态或确定性规则，`supportedWithoutEvidenceAccepted` 为 0。

Extractor 在 21 / 180 个病例出现 Clinical Semantic Drift；Gate 仅在 3 / 180 个病例出现漂移，且 3 次均为 high-risk fact change，没有观察到 Gate 的 true/false、true/unknown、true/uncertain 或 temporality change。Gate 的稳定性明显改善，但非零漂移与低 Holdout 通过率仍不满足进入下一阶段的条件。

## 最大的三个剩余问题

1. **证据定位对新表达泛化不足**：Evidence Span Recall 只有 50.88%，新 Holdout 的口语、错别字和混合隐晦表达全部失败，造成大量真实高风险事实被拒绝或遗漏。
2. **属性作用域和多轮语义仍不稳定**：Temporality Accuracy 40.35%、Certainty Accuracy 47.37%、Subject Accuracy 49.12%，时态、纠正和冲突场景仍会造成 Critical Miss 或 Unsupported ACCEPT。
3. **同模型相关错误与结构化输出风险尚存**：Verifier Accuracy 仅 67.35%，且 75 / 540 次提取结果未通过 Schema 验证；当前仍缺少临床验证证据。

## 最终判定

`FAIL`

`NOT_READY FOR PHASE 2B`
