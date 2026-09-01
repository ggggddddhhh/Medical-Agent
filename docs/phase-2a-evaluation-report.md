# Phase 2A Semantic Extraction Evaluation Report

## 1. Summary

Phase 2A 的工程隔离层、严格 Extraction Schema、真实 API provider 适配器、Gold Dataset、Semantic Sentinel Set、指标计算与 failure-mode harness 已完成。

本次没有使用真实患者数据，也没有使用 API key 调用付费真实模型。因此，本报告不能声称任何具体 LLM 已经达到临床语义可靠性阈值。受控 provider 的 100% oracle replay 只证明 Schema、Shadow plumbing 和 metrics harness 自身工作正常，不是模型能力分数。

最终 verdict：

> **PASS_WITH_CONDITIONS**

Phase 2A 工程基础可以用于受控的真实模型离线/Shadow 评测，但当前不具备进入 Phase 2B Assisted Semantic Extraction 的条件。

## 2. Delivered Architecture

- Phase 1 Core 保持唯一 clinical decision authority。
- LLM 仅作为同轮后台 Semantic Extraction sidecar。
- Candidate 经过 pathway-specific closed Schema 与 runtime validation。
- Candidate 永不写入 CaseState，不触发 action、disposition 或 tool。
- Shadow Evaluation Log 与 Production Decision Trace 分离。
- 模型 timeout、provider/rate-limit 错误和畸形输出不会影响确定性响应。
- OpenAI Responses API adapter 可接真实模型，模型名必须显式配置；本次未执行在线调用。

详细设计见 `docs/phase-2a-semantic-extraction-design.md`。

## 3. Readiness Check Result

| 分类 | 数量 | 结论 |
| --- | ---: | --- |
| BLOCKER（开始 Phase 2A 前） | 0 | 无需先机械清零全部 P1 |
| SHOULD_FIX_NOW | 2 | Pathway coupling 已完成最小重构；真实模型可靠性验证已具备 harness，但尚待在线评测 |
| CAN_DEFER | 3 | 临床签署、异步临床工具、持久化审计治理；均阻止更高阶段或部署，但不进入 Shadow decision path |

第三 pathway dry run 的结论从 architecture coupling 降为 acceptable extension cost：新增 pathway 需定义 protocol、enum/registry registration 和测试，不再需要给 medical-agent、policy-engine、state-machine、safety gate 或 tool layer 添加 symptom-specific branch。

## 4. Dataset

| Dataset | 数量 | 覆盖 |
| --- | ---: | --- |
| Gold Semantic Dataset | 24 | Headache 12、Chest Pain 12；标准、口语、不完整句、错别字、否定、不确定、修正、冲突、隐喻、拒答、unknown、时态与 hallucination guard |
| Semantic Sentinel Set | 8 | Headache 4、Chest Pain 4；突然起病/快速达峰、神经缺损、意识异常、发热颈硬、压榨、呼吸困难、晕厥冷汗、放射和持续严重症状 |

每条 Gold case 都包含 input、expected structured facts、expected unknown facts、expected negations 和 expected uncertainties；需要时额外包含 context facts 与 expected conflicts。评测对象是 extraction，不是 disposition。

## 5. Metrics

已实现：

1. Schema Validity Rate
2. Fact Precision
3. Fact Recall
4. Red Flag Fact Recall
5. Negation Accuracy
6. Unknown Accuracy
7. Uncertainty Accuracy
8. Hallucinated Fact Rate
9. Conflict Detection Accuracy
10. Semantic Sentinel Pass Rate

Harness oracle replay 结果：Schema Validity、Fact Precision/Recall、Red Flag Recall、Negation、Unknown、Uncertainty、Conflict 与 Sentinel 均为 100%，Hallucinated Fact Rate 为 0%。这是测试夹具自洽性结果。

本工程报告生成时真实 LLM 指标为 N/A。后续已完成 DeepSeek V4 Flash 正式双轮评测，结果为 **FAIL / NOT_READY**；真实指标和错误明细见 `docs/phase-2a-real-model-evaluation.md`。不得用本节 oracle replay 代替 real-model evidence。

## 6. Failure-mode Validation

自动化测试覆盖：

- invalid JSON 与 truncated output
- missing wrapper、extra/forbidden fields
- wrong enum、wrong type、duplicate path、非法 confidence
- 未提及事实不得被自动转为 false
- unknown/refused/uncertain 必须 abstain 为 null
- conflict 多值保留与 contradiction candidate
- timeout、provider error、rate limit、empty 和 null response
- prompt injection 生成 disposition/policy override 时整包拒绝
- OpenAI request 使用 strict JSON Schema、`store: false` 且无 tools
- Shadow candidate 不能修改 response、CaseState、disposition、tool decision
- Shadow failure 后确定性 emergency 行为继续执行
- Shadow log 与 production audit 均不记录测试原文标记

## 7. Regression and Safety Invariants

- Phase 1 基线测试：68
- Phase 2A 新增测试：34
- 最终测试：102
- 通过：102
- 失败：0
- Phase 1 Safety Invariants：10/10 继续通过
- 覆盖率：line 94.27%、branch 84.36%、function 97.22%

安全 invariant 的自动化通过不等于临床专家确认或真实世界验证。

## 8. Remaining Issues

### 进入 Phase 2B 前必须解决

1. 选定明确 provider/model/config，使用固定版本对 24+8 数据集进行多次真实离线运行并保存可复现结果。
2. 扩大 Gold 与 Sentinel 数据规模，加入更多错别字、地区口语、长句、多事实交织和多轮修正；由临床专家审核标签和高危漏检。
3. 根据真实结果制定 promotion thresholds；Semantic Sentinel 必须全通过，高风险事实不得存在已知漏检。
4. 设计真实 Shadow 数据的同意、去标识化、访问控制、保留期限和删除机制。
5. 评估模型升级、随机性、限流和供应商漂移带来的重复运行稳定性。

### 可以继续后置

- 临床工具的真实异步 cancellation/retry/concurrency。
- Audit 持久化实现、性能和长会话资源上限。
- Output Safety Gate 自动安全修正模式。

这些项目没有被本阶段悄然扩大为 UI、RAG、新 pathway 或 Multi-Agent 工作。

## 9. Promotion Decision

- 是否可以开始受控真实模型 Shadow Evaluation：**是**
- 是否证明某个真实 LLM 的自然语言理解可靠：**否**
- 是否可以让 LLM 更新 CaseState 或进入 decision path：**否**
- 是否具备进入 Phase 2B 的条件：**否**
- 是否可以扩展到临床部署：**否**

最终结论：**PASS_WITH_CONDITIONS**。
