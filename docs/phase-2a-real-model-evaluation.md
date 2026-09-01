# Phase 2A Real-Model Offline Evaluation

## 1. Model

- Provider: `DeepSeek`
- Model: `deepseek-v4-flash`
- API endpoint: `POST https://api.deepseek.com/responses`
- Base API format: `Responses API`
- Mode: `non-thinking`
- Reasoning configuration: `reasoning.effort = none`
- Temperature: `0`
- Tool access: `0`
- Model snapshot returned by API: `deepseek-v4-flash`

实现使用通用 `OpenAICompatibleResponsesAdapter`，DeepSeek compatibility profile 只处理 provider 参数差异，上层 Clinical Schema、Shadow Mode、Gold/Sentinel Dataset、metrics 和 safety boundary 没有改写。

根据 [DeepSeek Responses API 文档](https://api-docs.deepseek.com/api/create-response/)，Structured Output 使用 `text.format.type = json_schema`。DeepSeek 文档没有列出 OpenAI `strict` 字段，且 [Responses API compatibility table](https://api-docs.deepseek.com/guides/responses_api/) 标明 `store` 不受支持，因此请求中省略这两个 provider-specific 字段；本地 pathway-specific validator 仍执行完整严格校验，没有放宽 Schema。根据 [DeepSeek Thinking Mode 文档](https://api-docs.deepseek.com/guides/thinking_mode/)，本 baseline 固定关闭 thinking，未与其他模式混跑。

## 2. Evaluation

- Evaluation timestamp: `2026-09-01T11:02:23.183Z`
- Dataset version: `phase-2a-semantic-dataset-1.0.0`
- Schema version: `clinical-facts-1.0.0`
- Prompt version: `semantic-extraction-prompt-0.2.0`
- Formal runs: `2`
- Gold Cases: `24`，正式执行 `48` 次
- Semantic Sentinels: `8`，正式执行 `16` 次
- Formal API executions: `64`

正式评测前执行过一次 64-call compatibility preflight。该次运行发现远端 JSON Schema 比本地 validator 宽，随后把 path-specific value type 与 status/value 关系完整编码到远端 Schema。Preflight 结果已覆盖且不计入下表；正式结果没有混合不同 Schema 条件。

## 3. Semantic Metrics

| Metric | Result | Count |
| --- | ---: | ---: |
| Schema Validity Rate | 96.875% | 62 / 64 |
| Fact Precision | 31.33% | 47 / 150 |
| Fact Recall | 38.52% | 47 / 122 |
| Red Flag Fact Recall | 50.00% | 16 / 32 |
| Negation Accuracy | 100.00% | 10 / 10 |
| Unknown Accuracy | 94.87% | 74 / 78 |
| Uncertainty Accuracy | 0.00% | 0 / 6 |
| Hallucinated Fact Rate | 17.29% | 23 / 133 known predictions |
| Conflict Detection Accuracy | 100.00% | 8 / 8 |
| Semantic Sentinel Pass Rate | 0.00% | 0 / 16 executions；0 / 8 cases across both runs |

成功调用 API 或较高 Schema Validity 不能抵消 Red Flag Recall、Sentinel 与 hallucination 的失败。

## 4. Critical Errors

### Critical Semantic Miss

- `CRITICAL_SEMANTIC_MISS`: `10`
- 涉及唯一 Sentinel cases: `4 / 8`
- 类型：`incorrect_value_or_status = 10`
- `missed = 0`
- `incorrectly_changed_to_unknown = 0`
- `hallucinated_opposite_fact = 0`

路径分布：

| Critical path | Misses across two runs |
| --- | ---: |
| `symptoms.suddenOnset` | 2 |
| `symptoms.rapidPeak` | 2 |
| `redFlags.neurologicalDeficit` | 2 |
| `redFlags.alteredConsciousness` | 2 |
| `redFlags.collapseOrSweating` | 2 |

### Hallucinations

- Hallucinated known facts: `23`
- Hallucinated Fact Rate: `17.29%`

### Negation errors

- `0 / 10`
- Negation Accuracy: `100%`

### Unknown errors

- `4 / 78`
- Unknown Accuracy: `94.87%`

### Uncertainty errors

- `6 / 6`
- Uncertainty Accuracy: `0%`
- `C-GOLD-05` 在两轮中均触发本地 Schema rejection。

## 5. Reliability

- Provider Failure: `0 / 64`
- HTTP/rate-limit/timeout failure in formal run: `0`
- Schema Failure: `2 / 64`
- Run-to-run drift: `YES`
- Drift cases: `5 / 32`
  - `H-GOLD-06`
  - `H-GOLD-10`
  - `C-GOLD-06`
  - `C-GOLD-07`
  - `H-SENT-01`

自动化 failure-mode 测试另行覆盖 timeout、HTTP error、rate limit、empty response、malformed response、Schema violation 和 unexpected response shape。所有失败均 fail closed，不更新 CaseState、不改变 disposition，也不获得工具权限。

## 6. Audit and Data Handling

结果记录包含：provider、model、base API format、schemaVersion、promptVersion、datasetVersion、timestamp、model snapshot、case ID、run、结构化 candidate、validation/failure status 和聚合指标。

结果文件不包含 API Key、Chain-of-Thought、reasoning content、system prompt 或合成病例原始 input。正式脱敏结果位于 `evaluation/results/deepseek-v4-flash-phase-2a.json`。

## 7. Regression

- Current engineering tests: `116 / 116 passed`
- Phase 1 Safety Invariants: `10 / 10 passed`
- Coverage: line `94.41%`、branch `85.32%`、function `98.17%`
- Clinical Policy changes: `0`
- DeepSeek tool access: `0`
- Shadow candidate writes to CaseState: `0`

## 8. Clinical Status

`Clinical validation pending`

该结果只来自有限合成数据，尚无临床专家对标签、错误严重性或真实世界外推能力的正式签署。

## 9. Verdict

> **FAIL**

主要阻断原因：Semantic Sentinel 0/8、Critical Semantic Miss 10、Red Flag Recall 50%、Uncertainty Accuracy 0%、Hallucinated Fact Rate 17.29%，并存在 5 个 case 的 run-to-run drift。

## 10. Phase 2B

> **NOT_READY**

不得让 DeepSeek candidate 更新真实 CaseState、影响 disposition、触发工具或进入 assisted decision path。后续工作应留在 Phase 2A：分析受控 schema-valid 错误、修订 prompt 后建立独立实验版本，并重新执行完整 Gold + Sentinel 双轮评测；不同 prompt/mode 的结果不得混合。
