# Phase 2A — LLM Semantic Extraction Shadow Mode

## 1. 目标与边界

Phase 2A 只验证一件事：真实 LLM 能否把自然语言稳定转换为经过严格校验的结构化 Clinical Facts。

Phase 1 确定性安全内核继续是唯一权威 decision layer。LLM 不决定 disposition、AgentAction、SAFETY_ESCALATION、治疗、用药、工具调用或 clinical policy，也不能直接更新 CaseState。

本阶段不新增 Clinical Pathway、UI、RAG、Multi-Agent、互联网搜索、向量数据库或长期病史记忆。

## 2. Phase 2 Readiness Check

| Phase 1 P1 | 分类 | 本阶段处理 |
| --- | --- | --- |
| 两条 pathway 尚无临床专家正式签署 | CAN_DEFER | 不阻止工程 Shadow Mode；阻止 Phase 2B 和临床部署 |
| 新 pathway 需修改多个共享 Core 模块 | SHOULD_FIX_NOW | 已做最小重构，见第 3 节 |
| 真实异步临床工具行为未验证 | CAN_DEFER | LLM sidecar 不进入 tool layer；原工具门禁继续有效 |
| 真实 LLM 语义可靠性未验证 | SHOULD_FIX_NOW | 这是 Phase 2A 的主要验证目标；已建立适配器、数据集和指标，真实模型跑分仍待执行 |
| Audit、访问控制、保留和删除未持久化 | CAN_DEFER | Shadow evaluation 与 production audit 分离；进入真实数据试验前必须补治理方案 |

进入 Phase 2A 工程接入前没有未解决的 BLOCKER，但这不等于具备进入 Phase 2B 的条件。

## 3. Pathway 扩展与最小重构

原实现属于 architecture coupling：deterministic extractor、policy engine、department tool 和部分 warning 包含 symptom-specific 分支。

现在每个 pathway 通过统一 contract 提供：

- 基本信息、aliases、questions 和 emergencyRules
- `extractDeterministicFacts(text)`
- `determineDisposition(state)`
- `department`
- `warning`
- `semanticFactSchema`

共享 policy engine、medical agent 和 department tool 不再按 Headache/Chest Pain 分支。未来第三条 pathway 仍需增加 pathway 文件并修改 symptom enum、protocol registry 和对应测试，这属于 acceptable extension cost；不需要修改 state machine、safety gate、tool layer 或 shared policy 分支。

## 4. Semantic Extraction Architecture

同一轮输入采用两条隔离路径：

```text
User text ──> Phase 1 deterministic core ──> authoritative user response
     └──────> semantic shadow sidecar ──> strict validation ──> evaluation log
```

`SemanticShadowAgent` 先同步取得并返回 Phase 1 结果，再在后台执行 LLM extraction。调用方可通过 `waitForShadowEvaluations()` 等待评测完成，但生产响应不依赖该结果。

Shadow candidate 不会：

- merge 到 CaseState；
- 触发 state transition；
- 改变 disposition 或 response；
- 调用任何工具；
- 绕过 Input/Output Safety Gate。

## 5. Extraction Schema

Schema 版本为 `clinical-facts-1.0.0`。顶层只能包含：

```json
{
  "schemaVersion": "clinical-facts-1.0.0",
  "pathway": "HEADACHE_V1",
  "facts": []
}
```

每个 fact 必须且只能包含：

```json
{
  "path": "redFlags.neurologicalDeficit",
  "value": false,
  "status": "known",
  "confidence": 0.98,
  "temporality": "current",
  "contradictionCandidate": false
}
```

`status`：`known`、`unknown`、`refused`、`uncertain`、`conflicting`。

`temporality`：`current`、`previous`、`resolved`、`chronic`、`new_onset`、`unspecified`。

规则：

- Boolean known fact 的 value 只能是 `true` 或 `false`。
- 未提及的事实应省略或保持 unknown，不能推断为 false。
- `unknown`、`refused`、`uncertain` 的 value 必须为 `null`。
- `conflicting` 必须保留至少两个合法值。
- 路径、值类型、enum、范围、重复路径、缺失字段和额外字段都由运行时再次校验。
- 每个 pathway 只接受自身白名单中的 fact path。

LLM provider 可以使用原生 Structured Outputs，但 provider 约束不是安全边界；本地 runtime validator 才是 candidate 是否可进入评测数据的最终门禁。OpenAI adapter 使用 Responses API 的 strict JSON Schema 格式，且不配置 tools、不存储 response。实现依据为 [OpenAI Structured Outputs 官方文档](https://developers.openai.com/api/docs/guides/structured-outputs)。

## 6. 允许与禁止输出

允许输出限定在 pathway schema 注册的：chief complaint、onset、duration、severity、active/resolved 状态、明确关联症状、red flag candidate 和少量 relevant history fact；同时表达 negation、uncertainty、temporality、refusal、unknown 与 contradiction candidate。

禁止输出包括：diagnosis、differential diagnosis、disposition、AgentAction、SAFETY_ESCALATION、treatment、medication、dose、tool decision、clinical policy override，以及任何自由 prose。任何此类额外字段都会导致整个 extraction 无效。

## 7. Provider 与失败隔离

`SemanticExtractor` 接受可注入 provider。仓库提供零第三方依赖的 `OpenAIResponsesProvider`，模型名必须由部署者显式配置，不在安全内核中硬编码。

以下情况统一 fail closed，并只记录状态和错误码：timeout、provider error、rate limit、empty/null response、invalid JSON、truncated output、Schema violation 和 forbidden fields。失败不会阻止 Phase 1 Core 继续工作。

## 8. Audit 与数据分离

Production Decision Trace 继续记录 Phase 1 state、rule hits、actions、tools 和 disposition，不加入 LLM candidate。

独立 Shadow Evaluation Log 记录：

- `semanticExtractorVersion`
- `modelProvider`
- `modelName`
- `schemaVersion`
- `extractionStatus`
- `validationStatus`
- error code、结构化 candidate facts 和差异摘要

两类日志都不记录 Chain-of-Thought、隐藏推理或完整原始医疗文本。Gold Dataset 是独立的测试资产，不应与 production audit 混用。

## 9. Evaluation 与 Promotion Gate

Gold Dataset 包含 24 条：Headache 12 条、Chest Pain 12 条。Semantic Sentinel Set 包含 8 条高危表达，两条 pathway 各 4 条。

已实现指标：Schema Validity Rate、Fact Precision、Fact Recall、Red Flag Fact Recall、Negation Accuracy、Unknown Accuracy、Uncertainty Accuracy、Hallucinated Fact Rate、Conflict Detection Accuracy、Semantic Sentinel Pass Rate。

进入 Phase 2B 必须另行 Promotion Review。至少要求 Sentinel 全通过、无已知高风险漏检、Schema 稳定、hallucination 足够低、negation/unknown/uncertainty 可靠、LLM failure 不影响 Phase 1，以及 10 条 Phase 1 Safety Invariants 全部继续通过。阈值须由扩充后的数据规模、重复运行结果和临床审核共同确定。
