# Phase 2A.4 — Competition-Oriented Semantic Repair

## 结论

- **Verdict：NOT_READY**
- 是否建议立即进入 Phase 2B：**否**
- 临床状态：Clinical validation pending

本轮轻量修补显著改善了证据定位和高风险路由，且没有降低 Gate 标准：新 Blind Holdout 的 Unsupported ACCEPT 为 0，Red Flag Safe Routing 为 85.71%，6 条重复高风险病例的 Gate Drift 为 0。但模糊主体的 Clarification Trigger Recall 只有 76.92%，未满足评测前封存的“高风险不确定情况稳定触发 Clarification”条件，因此最终只能给出 `NOT_READY`。

## 范围与边界

本轮只修改：

1. Evidence Finder 的口语、错别字、同义表达和隐晦表达覆盖；
2. subject、temporality、certainty 的语言属性规则；
3. 否定的非布尔概念不再形成错误肯定映射。

没有新增 RAG、UI、Pathway、LangChain 或产品功能。Phase 1 Safety Core、Semantic Gate、SafetySignalDetector、Clarification Manager、Conversation Reconciler、Hybrid Validator、Verifier 和 Decision Trace 均保持不变；Verifier 仍然不能单独升级 `ACCEPT`。

## 轻量评测与隔离

- 24 条关键 Regression：每条运行 1 次；
- 24 条全新 Blind Holdout：每条运行 1 次；
- 其中 6 条高风险 Blind 病例再各运行 2 次；
- 总计 60 次病例执行，不再进行 500+ 次完整评测。

生产语义实现先冻结于 commit `2f5aeb3fefb4a49e729a15a6099ff78ac3790e08`。之后才创建新 Holdout，其规范化 SHA-256 为 `0ae26aa5bf551384a54542b0b5ed9c2ef2f31d6966bbaed1c84a6d1bdc9a3f87`，并在 commit `b939e32` 中封存。报告使用首次且唯一一次真实 `deepseek-v4-flash` 结果；未按 Holdout 失败调整语义规则，也未重跑。

## 主要指标变化

### 关键 Regression

用 Phase 2A.3 代码对最终 24 条 Regression 运行确定性基线。基线原始计数来自每例 3 次运行；下表将其折算为单轮，与 Phase 2A.4 的单轮真实模型评测比较。

| 指标 | Phase 2A.3 单轮基线 | Phase 2A.4 | 变化 |
| --- | ---: | ---: | ---: |
| Critical Semantic Miss | 16 | 0 | -100% |
| Unsupported ACCEPT | 5 | 0 | -100% |
| Red Flag Safe Routing | 7 / 23（30.43%） | 23 / 23（100%） | +69.57 个百分点 |
| Evidence Span Recall | 3 / 29（10.34%） | 29 / 29（100%） | +89.66 个百分点 |
| Subject Accuracy | 3 / 29（10.34%） | 29 / 29（100%） | +89.66 个百分点 |
| Certainty Accuracy | 2 / 29（6.90%） | 29 / 29（100%） | +93.10 个百分点 |
| Temporality Accuracy | 2 / 29（6.90%） | 29 / 29（100%） | +93.10 个百分点 |
| Clarification Trigger Recall | 6 / 7（85.71%） | 7 / 7（100%） | +14.29 个百分点 |

Regression 为开发集，只用于确认已知问题已修复，不能代替 Blind 泛化结论。

### 全新 Blind Holdout

| 指标 | Phase 2A.3 新 Holdout | Phase 2A.4 新 Holdout |
| --- | ---: | ---: |
| Critical Miss / 病例执行 | 51 / 120（42.50%） | 2 / 36（5.56%） |
| Unsupported ACCEPT | 15；比例 18.52% | 0；比例 0% |
| Red Flag Safe Routing | 51 / 96（53.13%） | 30 / 35（85.71%） |
| Evidence Span Recall | 87 / 171（50.88%） | 37 / 43（86.05%） |
| Subject Accuracy | 84 / 171（49.12%） | 34 / 43（79.07%） |
| Certainty Accuracy | 81 / 171（47.37%） | 34 / 43（79.07%） |
| Temporality Accuracy | 69 / 171（40.35%） | 37 / 43（86.05%） |
| Clarification Trigger Recall | 21 / 24（87.50%） | 10 / 13（76.92%） |
| Gate Drift | 3 / 180 cases | 0 / 6 repeated cases |
| Holdout case pass | 24 / 40（60.00%） | 21 / 24（87.50%） |

两阶段 Holdout 的数据规模与重复策略不同，因此 Critical Miss 以“每次病例执行”展示，Gate Drift 只比较各阶段实际重复子集，不能解读为临床性能置信区间。

## 其他验证

- 24 / 24 Regression 病例通过；
- Blind Holdout 21 / 24 病例通过，31 / 36 次执行通过；
- 总体 Red Flag Safe Routing 为 53 / 58（91.38%）；
- 总体 Uncertainty Safe Routing 为 17 / 20（85.00%）；
- Verifier Accuracy 为 62 / 79（78.48%）；
- Verifier 给出 `SUPPORTED` 但无 evidence 而被接受的次数为 0；
- provider failure 与 verifier failure 均为 0；
- 5 / 60 次 Extractor 输出未通过 Schema 验证，Gate 仍保持 fail-safe。

## 未通过原因

评测前封存的九项比赛条件中八项通过，唯一失败项是 `clarificationStable`。模糊主体病例 `P2A4-BLIND-SUB-04` 在三次重复中均被识别为“他人症状”并 `REJECT`，而没有识别为主体不清并触发追问。虽然没有造成 Unsupported ACCEPT，但不符合“高风险不确定时优先追问”的明确要求。

另有两个 Critical Miss：带程度副词的“呼吸非常吃力”未被 Evidence Finder 定位；“右臂发麻”中的独立“臂”表达未被神经缺损词典覆盖。根据 Holdout 隔离原则，本轮不再针对这三条失败修改规则。

## 最大的三个剩余问题

1. 模糊主体在“患者本人或他人”之间摇摆时，仍可能直接归为他人并拒绝，而不是进入 Clarification。
2. Evidence Finder 仍依赖有限词形和间隔模式，程度副词、独立肢体名词等新组合仍可漏检。
3. 评测规模仅 24 条 Blind、6 条重复病例，且 Extractor/Verifier 仍为同一模型；工程结果不足以替代临床验证。

## 最终判定

`NOT_READY`

当前不建议立即进入 Phase 2B。下一步应在一个独立阶段修复“主体不清必须追问”的通用策略，并使用全新样本验证；不得继续使用本 Holdout 调规则。
