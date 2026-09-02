# Phase 2A.2 — Semantic Robustness & Holdout Validation

## 结论

- **Verdict：FAIL**
- **Phase 2B：NOT_READY**
- 临床状态：Clinical validation pending

Phase 2A.1 的 Hybrid Semantic Layer 保住了原有 Sentinel，但未在新语义变体和 Blind Holdout 上证明泛化能力。错误事实进入 `ACCEPT` 的风险仍不可接受，因此本阶段不降低 Gate 标准、不调整生产语义规则，也不进入 Phase 2B。

## 评测范围与隔离

评测保留 24 条 Gold、8 条原始 Sentinel 和 8 条 Phase 2A.1 Sentinel，新增 60 条开发语义变体及 40 条 Blind Holdout，共 140 个病例。每个病例独立运行 3 次，总计 420 次真实模型执行。

新增数据覆盖口语、错别字、否定、不确定表达、历史与当前症状、引用他人症状、假设表达、多轮纠正、前后冲突、混合症状及隐晦 Red Flag 表达。

Blind Holdout 遵循以下隔离协议：

1. Detector、Gate、Verifier 与证据层冻结在生产基线 commit `b25c8b1f1214b23e49fd0f64343ce950963a7b78`。
2. Holdout 在冻结后单独封存，40 条数据的 SHA-256 为 `772db62c990eb78784dcf6b4498167c46167c6194d085d9ab91c0dbee769ae6f`。
3. 评测协议与数据在 commit `6e25bc9` 中提交后，才首次运行真实模型。
4. 本报告使用首次且唯一一次 Holdout 结果；未依据失败病例调整规则，也未重跑 Holdout。
5. 评测结果不保存原始患者输入、系统提示、推理过程或 API Key。

生产语义文件在首次运行前后的内容哈希一致，结果文件记录的 provider failure 与 verifier failure 均为 0。因此本次失败应归因于语义能力与安全架构，而不是服务不可用。

## 指标定义

- **Critical Semantic Miss**：预期的当前高风险事实未被 Gate 正确、安全地保留，包括错误 `ACCEPT`、`REJECT` 或缺失。
- **Unsupported ACCEPT**：缺少患者证据或与预期语义不符的事实被 Gate 接受。
- **Red Flag Safe Routing**：高风险事实被正确路由到 `ACCEPT`、`UNCERTAIN` 或 `REJECT` 的比例。
- **Uncertainty Safe Routing**：不确定事实未被错误固化为确定事实的比例。
- **Hallucination Rejection**：无患者证据或不应归属于患者的事实被拒绝的比例。
- **Clinical Semantic Drift**：忽略 JSON 顺序和置信度，仅比较三次运行间的临床状态变化，包括 true/false、true/unknown、true/uncertain、temporality 与高风险事实变化。
- **Holdout Pass**：病例三次执行全部通过才计为病例通过。
- **Verifier Accuracy**：Verifier 判定与隔离标注的一致率；Verifier 仅作为证据之一，不能覆盖患者证据和确定性规则。

## 总体结果

| 指标 | 结果 |
| --- | ---: |
| Critical Semantic Miss | 126（开发集 63，Holdout 63） |
| Unsupported ACCEPT | 45 / 196（22.96%） |
| Red Flag Safe Routing | 132 / 264（50.00%） |
| Legacy Sentinel | 24 / 24 executions（100%） |
| Phase 2A.1 Sentinel | 24 / 24 executions（100%） |
| Uncertainty Safe Routing | 21 / 39（53.85%） |
| Hallucination Rejection | 186 / 231（80.52%） |
| Holdout execution pass | 36 / 120（30.00%） |
| Holdout case pass | 12 / 40（30.00%） |
| Verifier Accuracy | 257 / 431（59.63%） |
| Extractor Clinical Semantic Drift | 17 / 140 cases（12.14%） |
| Gate Clinical Semantic Drift | 16 / 140 cases（11.43%） |

126 次 Critical Semantic Miss 中，111 次被 Gate `REJECT`、9 次缺失、6 次错误 `ACCEPT`。这说明严格 Gate 避免了部分无证据事实进入下游，但确定性证据覆盖不足，会把真实高风险事实一并丢弃；这些失败不能通过降低 Gate 标准解决。

45 次 Unsupported ACCEPT 中，32 次位于 `chiefComplaint.code`。开发集占 30 次，Holdout 占 15 次，主要暴露引用他人、假设、主体归属和上下文边界处理不足。

## Blind Holdout

| 类别 | 三次全通过病例 |
| --- | ---: |
| 口语表达 | 0 / 4 |
| 错别字 | 0 / 4 |
| 否定 | 3 / 4 |
| 不确定表达 | 0 / 4 |
| 历史 vs 当前 | 0 / 4 |
| 引用他人症状 | 3 / 4 |
| 假设表达 | 2 / 4 |
| 多轮纠正 | 3 / 4 |
| 前后冲突 | 1 / 4 |
| 混合症状与隐晦 Red Flag | 0 / 4 |

Holdout 仅 12 / 40 病例三次全部通过，且口语、错别字、不确定、时态和混合隐晦表达均为 0 / 4。原有 Sentinel 仍为 100%，而开发集病例通过率为 28 / 60（46.67%）、Holdout 为 30%，明确表明 Phase 2A.1 的修复尚未泛化。

## Clinical Semantic Drift

Extractor 有 17 / 140 个病例发生临床语义漂移，Gate 有 16 / 140 个病例发生漂移；Gate 只减少了 1 个漂移病例。Holdout 子集中，Extractor 与 Gate 均有 3 / 40 个病例发生漂移，涉及 `BLIND-UNC-03`、`BLIND-TIM-03` 和 `BLIND-CON-01`。

Extractor 记录到 41 次高风险事实变化、6 次时态变化及 2 次 true/unknown 变化。Gate 记录到 33 次高风险事实变化、13 次时态变化及 4 次 true/uncertain 变化。本轮没有观察到 true/false 变化，但其余变化已经足以否定稳定性要求。

## Verifier 专项评估

Extractor 与 Verifier 同为 `deepseek-v4-flash`，存在相关错误风险。Verifier 准确率仅为 257 / 431（59.63%），其中 130 次把期望 `UNCERTAIN` 的判断给成 `SUPPORTED`，33 次把期望 `UNCERTAIN` 给成 `CONTRADICTED`，另有 11 次把期望 `SUPPORTED` 给成 `UNCERTAIN`。

安全边界仍然有效：尽管 Verifier 共给出 304 次 `SUPPORTED`，但“无患者证据，仅因 Verifier=SUPPORTED 而 ACCEPT”的次数为 0。证据优先级保持为患者证据、确定性 Detector、否定/时态规则、Extractor、Verifier；Verifier 没有成为最终裁判。

## 其他稳定性观察

420 次 Extractor 调用均完成，但有 55 次输出未通过 Schema 验证：Gold 4 次、开发集 27 次、Holdout 24 次。这进一步降低了复杂语义下的可用性。由于 provider failure 为 0，不能把这些失败解释为偶发网络或服务故障。

## 最大的三个剩余问题

1. **确定性证据覆盖脆弱**：口语、错别字及隐晦高风险表达不能稳定映射到证据，导致真实关键事实被 `REJECT` 或遗漏。
2. **主体、否定、时态与不确定性组合处理不足**：引用、假设、历史/当前和冲突语句仍会产生 Unsupported ACCEPT 或错误路由。
3. **同模型 Verifier 与结构化输出不稳定**：Verifier 准确率低且偏向过度 `SUPPORTED`，同时有 55 / 420 次 Schema violation；临床验证仍未完成。

## 最终判定

`FAIL`

`NOT_READY FOR PHASE 2B`
