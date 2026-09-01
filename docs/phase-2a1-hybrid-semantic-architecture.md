# Phase 2A.1 Hybrid Semantic Validation Architecture

## 1. Current Failure

Phase 2A 的 `deepseek-v4-flash` baseline 能稳定返回大部分 Schema-valid JSON，但 Semantic Sentinel exact pass 为 0%、Uncertainty Accuracy 为 0%、Hallucinated Fact Rate 为 17.29%，并有 5/32 run-to-run drift。问题不是 API 可用性，而是 Schema valid 不等于事实有原文证据，也不等于危险语义已被安全处理。

## 2. Why Single-LLM Extraction Failed

原链路只有 `Patient Language → DeepSeek → Clinical Facts → Schema Validator`。Schema Validator 能拒绝非法结构，却不能判断 known fact 是否有原文支持、是否把 quoted/other-person 语言当作患者本人、是否混淆 current/previous/resolved，也无法在 LLM 漏掉 high-risk field 时产生第二通道信号。

## 3. New Architecture

```text
                     Patient Language
                           │
              ┌────────────┴────────────┐
              │                         │
      SemanticExtractor         SafetySignalDetector
      deepseek-v4-flash           deterministic
              │                         │
       LLM candidate facts       safety candidates + evidence
              └────────────┬────────────┘
                           │
                  HybridSemanticValidator
                           │
                  TargetedVerifier
               same model, one fact only
                           │
                     SemanticGate
                    ↙       ↓       ↘
                ACCEPT   UNCERTAIN   REJECT
                   │         │
              shadow facts   shadow follow-up
```

所有输出仍为 `mode=shadow`。`acceptedFacts` 不写入 CaseState、不改变 disposition、不触发工具，也不替代 Phase 1 deterministic Safety Core。

## 4. Semantic Extractor

Extractor 保持 `clinical-facts-1.0.0` Schema 与 `semantic-extraction-prompt-0.2.0`，用于可比的全病例 candidate extraction。它仍不能输出 diagnosis、disposition、treatment、medication、tool call 或自由文本。Phase 2A.1 没有用新 Prompt 掩盖 baseline failure。

## 5. Safety Signal Detector

`SafetySignalDetector` 只从现有 Headache/Chest Pain pathway、questions、emergency rules 与 semantic fact paths 中寻找候选，不做诊断或医疗处置。

- Headache：sudden/onset pattern、rapid peak、worst ever、neurological deficit、fever + neck stiffness、altered consciousness、recent head trauma。
- Chest Pain：difficulty breathing、pressure/crushing/heavy、pain radiation、collapse/sweating、persistent severe pain。

每个 candidate 包含 `factPath`、`proposedValue`、`polarity`、`temporality`、signal 与 source evidence span。Polarity 可为 `positive`、`negative`、`uncertain`、`contextual` 或聚合后的 `conflicting`。Detector 会检查否定、引用/资料转述、假设、他人主体和时态；不能可靠判断时只产生 candidate。

## 6. Targeted Verifier

`TargetedVerifier` 一次只接收患者原话、一个 candidate fact、已找到的 evidence 与 pathway。严格 JSON 仅允许：

```json
{"verdict":"SUPPORTED | CONTRADICTED | UNCERTAIN"}
```

它不得重新抽取整例，不得生成新 facts、诊断、处置、治疗、药物或工具调用。malformed output、timeout、HTTP/provider failure 一律返回 `UNCERTAIN`。当前 extractor 与 verifier 都是 `deepseek-v4-flash`，存在 correlated error risk；Provider Interface 允许未来不同模型，但本阶段未接入第二付费模型。

## 7. Semantic Gate

Gate 对 LLM 与 detector 的 union paths 逐事实判定。高风险事实、冲突、uncertain/conflicting facts 与无证据 known facts进入 targeted verification。LLM candidate 和 detector evidence 分离；`confidence` 从不作为证据。

## 8. ACCEPT / UNCERTAIN / REJECT

### ACCEPT

- candidate 为合法 known fact；
- 有直接 source evidence 或明确允许的 deterministic evidence；
- detector 与 candidate 的 value/polarity/temporality 不冲突；
- 需要 verifier 时，verifier 必须 `SUPPORTED`；
- 无 multi-turn/contradiction conflict。

### UNCERTAIN

- 用户自己使用 hedged/uncertain 表达；
- quoted、hypothetical、other-person reference 无法可靠归属于患者；
- LLM 与 detector 或 evidence temporality 冲突；
- multi-turn conflict、`contradictionCandidate` 或 fact status 为 conflicting/refused/unknown；
- verifier 为 `UNCERTAIN`、timeout、malformed 或 provider failure。

### REJECT

- LLM Schema invalid candidate；
- known fact 无 source evidence；
- candidate 与明确否定冲突；
- verifier 明确 `CONTRADICTED`；
- 没有任何 candidate fact。

## 9. Failure Handling

Extractor failure 不关闭 deterministic detector。Verifier failure 不能让 fact 从 `UNCERTAIN` 变 `ACCEPT`。脱敏 Shadow audit 只保存 evidence offset/count，不保存患者原文、API Key、system prompt、reasoning 或 Chain-of-Thought。

## 10. High-Risk Fact Handling

现有 pathway high-risk paths 使用双通道。若 `A=LLM false/unknown` 且 `B=detector positive candidate`，Gate 进入 conflict，不直接采用 A。Detector-derived known fact 也必须有 evidence，并在 high-risk path 上取得 targeted verifier support 才能 ACCEPT；否则为 UNCERTAIN/REJECT。任何 Gate 结果仍不进入 Phase 1 CaseState。

## 11. Hallucination Guard

`FactEvidence` 与 Clinical Fact Schema 独立。每个 known fact 必须由 detector span 或窄 direct-text pattern 支持；无证据即 REJECT。evidence 中的 temporality 与 candidate 冲突时为 UNCERTAIN。类似“反复三个月”不会仅凭宽关键词自动接受为 `priorSimilarEpisode`。模型自报 confidence 无论多高都不能绕过 Guard。

## 12. Shadow Follow-up

UNCERTAIN high-risk fact 尽量复用现有 pathway question。例如 rapid peak 复用 HEADACHE_ONSET，dyspnea 复用 CHEST_PAIN_BREATHING。Proposal 只记录在 `shadowFollowUpProposals`，不改变真实对话顺序。

## 13. Evaluation Plan and Result

正式运行固定 `deepseek-v4-flash`、non-thinking、temperature=0、2 runs。comparable subset 保持 24 Gold + 原 8 Sentinel，共 64 次 extraction；另加 8 条 Phase 2A.1 Sentinel，共 16 次 extraction。Targeted verifier 共 95 次窄调用。

| Metric | Historical baseline | Paired extractor rerun | After Semantic Gate |
| --- | ---: | ---: | ---: |
| Red Flag exact/safe-routing recall | 50.00% | 50.00% | 100.00% (32/32) |
| Uncertainty exact/safe routing | 0.00% | 0.00% | 100.00% (6/6) |
| Hallucinated / accepted-unsupported known rate | 17.29% | 16.15% | 0.00% (0/68) |
| Hallucination rejection | n/a | 21 opportunities | 100.00% (21/21) |
| Critical Semantic Miss | 10 | 10 | 0 |
| Legacy Sentinel pass | 0/16 | 0/16 | 16/16; 8/8 cases |
| Phase 2A.1 Sentinel pass | n/a | n/a | 16/16; 8/8 cases |
| Run-to-run drift | 5/32 | 5/32 | 5/32 strict Gate payload |

其他 Gate 指标：Accept Precision 68/68=100%，Reject Precision 17/33=51.52%，Uncertain Rate 48/149=32.21%，Detector Recall 30/30=100%，Conflict Catch 12/12=100%，Verifier Resolution Accuracy 58/95=61.05%。`UNCERTAIN` 是安全路由，不以提高 ACCEPT rate 为目标。

## 14. Known Limitations

- Detector 是有限中文 pattern set，真实语言、方言、错别字和复杂共指覆盖不足。
- Extractor 与 verifier 为同一模型，错误相关；58/95 verifier accuracy 不能视为独立验证。
- strict Gate payload drift 仍为 5/32，没有改善。
- Gold 是小规模合成 closed-world 数据；额外 supported fact 可能被计算为 hallucination。
- evidence linker 是窄规则，不是通用自然语言蕴含器。
- 串行逐事实 verification 增加延迟与成本。
- 没有 RAG、长期记忆、第三 pathway、UI、诊断或 medication 功能。

## 15. Clinical Validation Status

`Clinical validation pending`。当前结果仅为 engineering validation，不代表已完成临床或医学验证，也不代表可投入临床部署。

## 16. Phase 2B Promotion Criteria

Phase 2A.1 verdict：`PASS_WITH_CONDITIONS`。Phase 2B：`NOT_READY`。

进入 Phase 2B 前至少需要：独立临床专家审核 pathway/Gold/严重性定义；扩大真实语言与 adversarial detector 数据；降低或隔离 Gate payload drift；改善 verifier 独立性或证明同模型核验的边际价值；在更大数据上维持 critical miss=0、red-flag safe routing=100%、accepted unsupported known=0、两组 Sentinel=100%，并完成隐私、延迟、成本与审计策略评审。
