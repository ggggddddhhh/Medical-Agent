# Phase 2A.1 Failure Analysis

## 1. Scope and evidence

本报告先审计 baseline commit `aee9a8c` 下的代码、Clinical Fact Schema、Gold Dataset、8 条 Semantic Sentinel、`docs/phase-2a-real-model-evaluation.md` 与脱敏产物 `evaluation/results/deepseek-v4-flash-phase-2a.json`，再说明 Hybrid Gate 的验证结果。分析属于 engineering validation；`Clinical validation pending`。

历史 baseline 为 24 Gold + 8 Sentinel × 2 runs，共 64 次真实 `deepseek-v4-flash` 抽取：Schema Validity 96.875%，Fact Precision 31.33%，Fact Recall 38.52%，Red Flag Recall 50%，Uncertainty Accuracy 0%，Hallucinated Fact Rate 17.29%，Sentinel Pass 0/16，Critical Semantic Miss 10，Schema Failure 2，drift 5/32。

## 2. The most important audit correction

历史报告中的 10 个 `CRITICAL_SEMANTIC_MISS` 不是 10 次危险概念完全漏检。模型在 10/10 次均给出了正确的 `true` 值，失败全部来自严格 temporality 比较：

| Case / path | Gold temporality | Model temporality | Executions |
| --- | --- | --- | ---: |
| H-SENT-01 `symptoms.suddenOnset` | `new_onset` | `current` | 2 |
| H-SENT-01 `symptoms.rapidPeak` | `new_onset` | `current` | 2 |
| H-SENT-02 `redFlags.neurologicalDeficit` | `new_onset` | `current` | 2 |
| H-SENT-03 `redFlags.alteredConsciousness` | `previous` | `current` | 2 |
| C-SENT-03 `redFlags.collapseOrSweating` | `previous` | `current` | 2 |

因此 `Critical Semantic Miss = 10` 仍是有效的 strict-schema failure，但不能表述为“危险信号值漏掉 10 次”。这同时暴露出 evaluator 将 value/status/temporality 合并成单一 exact-match 指标的问题。

## 3. Failure taxonomy

| Class | Baseline evidence | Assessment |
| --- | --- | --- |
| `MISS` | H-GOLD-10 某轮漏 chief complaint；H-GOLD-11 两轮把 onset uncertainty 放到 `suddenOnset` 而非要求的 `onsetPattern` | 存在，但无 Sentinel 危险值完全漏检 |
| `FALSE_POSITIVE` | H-GOLD-08 将“脑袋快炸了”推成 severity=10、activeNow=true 等 | 与 hallucination 重叠 |
| `HALLUCINATION` | 23 个 known predictions 的 path 不在该 case Gold expected facts 中，17.29% | 严重；closed-world Gold 也可能把有原文支持但未标注的额外事实计入 |
| `NEGATION_ERROR` | 0/10 | 未观察到；不能外推到真实世界 |
| `UNKNOWN_COLLAPSE` | 4/78：H-GOLD-08 severity 两轮；C-GOLD-11 将 Gold unknown 输出为 uncertain 两轮 | 存在 |
| `UNCERTAINTY_COLLAPSE` | 6/6：H-GOLD-05 输出 known true；H-GOLD-11 输出了错误 path；C-GOLD-05 两轮 Schema rejection | 主要失败 |
| `TEMPORALITY_ERROR` | 10 个 critical exact misses；另有 H-GOLD-09 resolved/current、C-GOLD-08 previous/current 等 | 主要失败 |
| `CONFLICT_ERROR` | aggregate conflict detection 为 8/8，但 C-GOLD-09 输出 known true + `contradictionCandidate`，并非 Gold `conflicting`; H-GOLD-07 value 正确但 temporality 不同 | evaluator 的 conflict 指标比 exact fact match 宽松 |
| `SCHEMA_FAILURE` | C-GOLD-05 两轮被本地 Schema 拒绝 | 2/64；fail closed 正确 |
| `RUN_TO_RUN_DRIFT` | H-GOLD-06、H-GOLD-10、C-GOLD-06、C-GOLD-07、H-SENT-01 | 5/32 |
| `RED_FLAG_MISS` | strict Red Flag Recall 16/32；由 uncertainty、Schema、conflict 表达和 temporality 共同造成 | 不能简单等同于概念漏检 |
| `GOLD_LABEL_SUSPECT` | C-GOLD-07 “反复三个月”与 `priorSimilarEpisode` 的边界；chief complaint 默认 `unspecified` 是否应与 `current` exact 比较 | 有疑点，但本阶段未改 Gold |
| `SCHEMA_DESIGN_SUSPECT` | Schema 能表达 unknown/uncertain/conflicting，但每个 fact 同时要求 status/value/temporality/confidence/contradiction，远端生成负担高 | secondary |
| `PROMPT_DESIGN_SUSPECT` | Prompt 虽定义 hedged→uncertain，却没有用对比例子明确 UNKNOWN/UNCERTAIN/FALSE 与 temporality | primary |
| `MODEL_CAPABILITY_LIMIT` | 相同输入、temperature=0 仍有 5/32 drift；schema-valid 但 semantic-wrong 输出持续存在 | primary/secondary，不能单独解释全部失败 |
| `OTHER` | evaluator 的 closed-world hallucination 与 exact temporality 会放大部分错误 | 需要分层指标 |

## 4. Eight historical Sentinels

| Sentinel | Gold | Actual across both runs | Failed fields / type | Deterministic detector | Targeted verifier | Shadow follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| H-SENT-01 | headache；suddenOnset=true/new_onset；rapidPeak=true/new_onset | 危险值均为 true，但 temporality=current；一轮多 activeNow | 两个 path 的 `TEMPORALITY_ERROR`；且 case drift | 可：突然/炸开/几秒/痛到顶 | 值值得核验；时态仍可能不确定 | “这个头痛是突然在几秒到几分钟内达到最严重程度，还是逐渐出现的？” |
| H-SENT-02 | neurologicalDeficit=true/new_onset | true/current | `TEMPORALITY_ERROR`，不是值漏检 | 可：单侧肢体没劲、说话不清；需防止把“肢体突然”误当“头痛突然” | 值与 reference/temporality 值得核验 | HEADACHE_NEURO 原问题 |
| H-SENT-03 | alteredConsciousness=true/previous | true/current | `TEMPORALITY_ERROR` | 可：昏过去、叫醒 | 值和历史时态值得核验 | HEADACHE_CONSCIOUSNESS 原问题 |
| H-SENT-04 | feverNeckStiffness=true/current | exact danger fact；chief complaint temporality 为 current 而 Gold 默认 unspecified | Sentinel exact failure；无 critical danger failure | 可：发热 + 颈部僵硬组合 | 可确认组合是否属于患者当前陈述 | HEADACHE_FEVER_NECK 原问题 |
| C-SENT-01 | pressureOrCrushing=true/current；persistentSevere=true/current | 两个危险值均 exact；额外 activeNow | Sentinel 主要因 chief complaint temporality；`EXTRA_KNOWN` | 可：重物压住、一直很痛 | 高风险值值得窄核验 | CHEST_PAIN_PRESSURE / CHEST_PAIN_ACTIVE |
| C-SENT-02 | difficultyBreathing=true/current | danger fact exact | Sentinel 主要因 chief complaint temporality | 可：喘不上气、吸不到空气 | 值得核验患者本人、否定与时态 | CHEST_PAIN_BREATHING |
| C-SENT-03 | collapseOrSweating=true/previous | true/current | `TEMPORALITY_ERROR` | 可：晕过去、冷汗、刚才 | 值与 previous/current 值得核验 | CHEST_PAIN_COLLAPSE |
| C-SENT-04 | persistentSevere=true/current；painRadiation=true/current | 两个 danger facts exact | Sentinel 主要因 chief complaint temporality | 可：一直不缓解、窜到手臂/下巴 | 两个事实分别核验 | CHEST_PAIN_ACTIVE / CHEST_PAIN_RADIATION |

结论：8 条 Sentinel 的危险 value 并非 0/8；原 0/8 是严格 envelope exact pass。新架构不能据此放松 Schema，而应把“危险概念是否被安全捕获”和“完整事实是否 exact”拆成两个指标。

## 5. UNKNOWN, UNCERTAIN and FALSE

- `UNKNOWN`：用户没有提供该信息，例如“我没说有没有喘不上气”。
- `UNCERTAIN`：用户提供了相关信息，但对其真实性或程度表示犹豫，例如“好像有一点，也可能只是紧张”。
- known `false`：用户明确否定，例如“没有喘不上气”。

Schema 已能表达三者，因此 Schema 不是 uncertainty=0 的唯一原因。失败来自 Prompt 缺少对比约束、模型把 hedged claim 变 known true/错误 path，以及 provider 对复杂 fact variant 的不稳定生成。Hybrid 层把 detector 的 `uncertain/contextual` 直接路由为 `UNCERTAIN`，不强迫二值化。

## 6. Root-cause judgment

| Dimension | Judgment | Case support |
| --- | --- | --- |
| Architecture issue | **PRIMARY** | Single-LLM 输出只要 Schema valid 就成为完整 candidate；23 个 hallucinated known facts 没有 source-evidence gate；无独立危险信号通道 |
| Prompt issue | **PRIMARY** | uncertainty 0/6；UNKNOWN/UNCERTAIN/FALSE 和 temporality 缺少窄任务对比例子 |
| Model issue | **PRIMARY / SECONDARY** | 5/32 drift；schema-valid semantic errors；但 Sentinel 危险 value 实际识别较好，不能把全部问题归咎于模型 |
| Schema issue | **SECONDARY** | 2 次 Schema failure；表达力足够，但组合复杂且没有 evidence 字段 |
| Evaluator issue | **SECONDARY** | exact temporality 让 10 次正确危险值变 critical miss；0/8 Sentinel 容易被误读；closed-world hallucination 会惩罚 Gold 未列出的 supported extras |
| Gold issue | **MINOR / UNSUPPORTED AS A GENERAL CAUSE** | 只有 C-GOLD-07 和默认 temporality 有明确疑点；没有证据支持批量改标签，本阶段保持原 Gold |

最主要三个根因是：缺少 evidence-based independent gate 的架构问题；Prompt/任务定义对 uncertainty 与 temporality 的约束不足；同一模型在复杂 schema 下的语义与运行稳定性不足。

## 7. Phase 2A.1 verification outcome

正式 Phase 2A.1 运行时间为 `2026-09-01T11:58:56.025Z`。同一 64-execution comparable subset 的 extractor rerun 因模型漂移得到 Schema Validity 95.31%、Red Flag Recall 50%、Uncertainty Accuracy 0%、Hallucinated Fact Rate 16.15%，说明模型本身没有“被调聪明”。Gate 后：

- Legacy Sentinel safe pass：16/16 executions，8/8 cases。
- Phase 2A.1 Sentinel：16/16 executions，8/8 cases。
- Critical Semantic Miss After Gate：10 → 0；temporality 冲突被隔离为 `UNCERTAIN` 并产生 follow-up。
- Red Flag Detector Recall：30/30；Red Flag Safe Routing Recall：32/32。
- Hallucination Rejection：21/21；accepted unsupported known facts：0/68。
- Uncertainty Safe Routing：6/6。
- Extractor drift：5/32；strict Gate payload drift：5/32，未改善。
- Verifier Resolution Accuracy：58/95（61.05%），证明同模型 verifier 不能被当成独立真值来源。

Phase 2A.1 engineering verdict 为 `PASS_WITH_CONDITIONS`，但 Phase 2B 仍为 `NOT_READY`。原因包括 strict drift 未下降、verifier accuracy 有限、detector 词表覆盖有限、同模型 correlated error risk，以及独立临床验证仍 pending。
