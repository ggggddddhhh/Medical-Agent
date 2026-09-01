# Phase 1 Core Validation Report

## 1. Validation Scope

本次验证针对当前确定性医疗安全内核，不扩展产品范围。验证对象包括：

- README 与产品设计约束
- 通用 CaseState 与事实状态
- Agent Action State Machine
- HEADACHE_V1 与 CHEST_PAIN_V1
- Stop Asking Policy
- Scope、Medication、Self-harm 与 Prompt Injection 边界
- 三个只读白名单工具及其失败模式
- Output Safety Gate
- Decision Trace 与 Session 隔离
- 新增第三条 pathway 的架构演练

验证重点是 Behavioral Coverage，而不是单纯追求行覆盖率或测试数量。

## 2. Validation Limitations

当前没有接入真实 LLM，因此本报告不能证明：

- 开放式自然语言理解
- 错别字、方言、复杂口语和隐喻理解
- 隐含危险信号的可靠提取
- LLM 结构化抽取的准确性和稳定性
- LLM hallucination、越权规划和提示注入鲁棒性
- 多模型或长上下文下的行为一致性

确定性抽取目前只能验证明确词表和规则内的表达。例如“突然疼得受不了”“胸口像压了块石头”已纳入明确规则；“脑袋快炸了”“胸前勒得慌”等隐喻仍被保留为：

> Future LLM Semantic Extraction Requirement

本次也没有验证：

- 临床专家对协议内容的独立审核
- 真实医院环境或真实患者数据
- 异步工具的真实网络超时、取消和并发竞争
- 数据库、长期存储、访问控制和审计留存
- 性能、负载、可用性和灾难恢复

## 3. Architecture Assessment

### 3.1 CaseState

Strengths：

- Core 使用通用的 patientContext、symptoms、redFlags 和 relevantHistory 容器，基础 Schema 没有写死 Headache 或 Chest Pain 字段。
- 不依赖原始聊天文本作为关键决策状态。
- 能表达 unknown、known true、known false、conflicting 和 refused。
- 用户修正信息时保留历史值，并以最新结构化值重新执行安全策略。
- 重复相同回答不会产生虚假冲突。
- Session 之间隔离，外部 snapshot 为深拷贝，不能回写内部状态。
- 支持版本化序列化、恢复和继续执行。

Weaknesses：

- Pathway 事实字段仍是动态对象，尚无逐 pathway 的运行时 Schema。
- 恢复校验确认了顶层结构和版本，但尚未严格验证每个事实值和枚举。
- Fact metadata 记录轮次和值历史，但尚未记录 extractor 来源、置信度和人工确认状态。
- 会话可以恢复，但 AuditLog 仍是进程内存，不会随 CaseState 一起持久化。

结论：满足进入受控语义抽取集成的基础状态要求，但接入 LLM 时必须对抽取结果进行 Schema 校验，不能让 LLM 直接写任意字段。

### 3.2 State Machine

当前已经存在显式合法转移表，而不是仅靠动作名称和自由分支：

- ASK_MORE 和 OUT_OF_SCOPE 是可继续状态。
- DISPOSITION、SAFETY_ESCALATION、INSUFFICIENT_INFO 是终态。
- 终态允许向 SAFETY_ESCALATION 单向升级。
- SAFETY_ESCALATION 不允许转回 ASK_MORE、DISPOSITION 或 SELF_MONITOR。
- CALL_TOOL 是瞬时审计事件，不是持久化决策状态。

High-risk monotonicity 已通过普通否认、感觉好转和终态后事实修正测试。

### 3.3 Pathway Abstraction

Strengths：

- Pathway 文件封装了问题、fact path、parser、red flag rules 和版本。
- Medical Agent 的主要循环对现有 pathway 基本通用。
- 决定性危险信号能够在普通边界判断和工具失败之前抢占。

Weaknesses：

- fact-extractor.js 集中包含 Headache 和 Chest Pain 的语义规则。
- policy-engine.js 的最终 disposition 仍按 chief complaint 分支。
- default-tools.js 的科室映射按 chief complaint 分支。
- medical-agent.js 的部分警示文案仍偏 Headache。

结论：路径定义实现了部分抽象，但还没有达到“新增 pathway 只增加一个定义文件和测试”的目标。

### 3.4 Tool Layer

Strengths：

- 工具必须显式声明 readOnly。
- 非白名单工具无法调用。
- 三个工具都具有严格结果 Schema。
- exception、timeout-like error、null、空对象、畸形结构、额外字段和恶意文本均 fail safe。
- Emergency resource 或 department tool 失败时使用保守 fallback，不补造医院信息。
- 协议查询工具失败不能遮蔽本地规则已经识别出的 emergency。

Weaknesses：

- 当前工具接口是同步接口，timeout-like 测试通过抛出错误模拟，不是真实异步超时。
- Tool Result Schema 集中在校验器中，新增工具仍需修改共享文件。

### 3.5 Safety Gate

Strengths：

- 拦截处置矛盾、疾病确诊、个体化剂量、虚假保证和无证据医院信息。
- EMERGENCY_NOW 必须与 SAFETY_ESCALATION 和可执行急救指引一致。
- 输入层可识别 Self-harm、Medication Boundary、Diagnosis Boundary 和 Prompt Injection。

Weaknesses：

- 当前仍以确定性规则和文本模式为主，不能代表开放语言空间的完整覆盖。
- Safety Gate 当前采用“拒绝并抛错”，尚无经过验证的自动修正模式。

### 3.6 Audit

Strengths：

- Trace 包含 pathway、结构化 state、actions、disposition、reasonCodes、ruleHits、tool calls、tool status、policy version 和 model version。
- reasonCodes 与实际 ruleHits 已分离。
- 不保存完整原始用户文本、Chain-of-Thought 或隐藏推理。

Weaknesses：

- AuditLog 当前仅在内存中。
- Trace 含有完成决策审计所需的结构化医疗事实，后续必须设计访问控制、保留期限和删除策略。

## 4. Safety Invariants

- 总数：**10**
- 已有自动化行为测试：**10**
- 未覆盖：**0**

完整定义和测试映射见 docs/safety-invariants.md。

自动化覆盖不等于临床验证。所有 invariant 在接入真实 LLM 后必须再次运行，并增加抽取层特有的对抗测试。

## 5. Test Summary

验证前基线：**21 / 21**

新增测试：**47**

最终测试：**68**

最终覆盖率作为辅助指标：line **94.16%**、branch **86.49%**、function **97.44%**。最终判定仍以行为覆盖和剩余风险为准，而不是由覆盖率自动决定。

新增测试按主要目的划分：

| Suite | 数量 | 主要覆盖 |
| --- | ---: | --- |
| CaseState 与状态转移 | 10 | 五态事实、冲突、重复回答、隔离、深拷贝、序列化恢复、非法转移 |
| Pathway 与对抗边界 | 10 | 修正、拒答、无限追问、歧义、Headache/Chest Pain 变体、孕期和范围 |
| Safety Invariants | 12 | 10 条 invariant、急症优先级、终态单调性与升级 |
| Tool 与 Failure Mode | 13 | 正常、异常、timeout-like、null、empty、malformed、恶意结果、只读约束 |
| Validation 文档契约 | 2 | invariant 数量、限制、问题分级、第三路径演练和最终判定 |

原有与新增测试共同覆盖 unit、state transition、pathway、safety、adversarial、failure mode、audit 和 documentation contract。

## 6. P0 Issues

### 验证期间发现并已修复

1. CaseState 无法表达 unknown、refused 和 conflicting，也不能恢复执行。
2. Action 名称存在但没有显式合法转移表。
3. Emergency 终态后“感觉好转”没有继续重申急救，普通终态也不能根据修正事实升级。
4. 非临床边界输入和协议工具故障可能遮蔽同一句中的 emergency。
5. 工具结果缺少严格 Schema，恶意或畸形结果可能进入响应生成。
6. 明确否定表达可能被危险词检测错误覆盖，Headache 还缺少 worst-ever 与意识异常规则。

### 剩余 P0

**0**

这里的“0”仅针对进入受控 LLM Semantic Extraction Integration 的工程门槛，不代表可以进入公开医疗服务或临床部署。

## 7. P1 Issues

剩余 **5** 项：

1. 两条 Clinical Pathway 尚未完成临床专家独立审核和正式签署。
2. 第三路径会修改 extractor、policy、department mapping 和部分输出文案，共享 Core 与 Pathway 仍有耦合。
3. 尚未验证真实异步工具的 timeout、cancellation、retry 和并发行为。
4. 真实 LLM 的结构化抽取、abstain、置信度、错别字和方言能力尚未验证。
5. Session 可以序列化恢复，但 Audit、访问控制、保留期限和删除机制尚未持久化设计。

## 8. P2 Issues

剩余 **3** 项：

1. CaseState 恢复和逐 pathway fact value 可以增加更严格的运行时 Schema 与 provenance。
2. Output Safety Gate 可以增加经过验证的安全修正模式，目前只有阻断。
3. 尚未执行性能、负载、长会话资源上限和故障恢复测试。

## 9. Expansion Assessment

### Architecture Dry Run：ABDOMINAL_PAIN_V1

本阶段没有实现腹痛路径，仅进行了修改面演练。

理论上需要新增：

- src/protocols/abdominal-pain.js
- test/agent-abdominal-pain.test.js
- 腹痛专用 adversarial 与 red flag fixtures

当前架构还需要修改：

- src/domain/constants.js：新增 chief complaint
- src/protocols/index.js：注册 pathway
- src/extraction/fact-extractor.js：增加腹痛语义字段抽取
- src/engine/policy-engine.js：增加腹痛 disposition 规则
- src/tools/default-tools.js：增加科室映射
- src/engine/medical-agent.js：消除或分离 Headache 专用 warning 文案
- src/tools/tool-result-validator.js：若新增专用工具，需要增加结果 Schema

结论：Medical Agent 主循环、安全状态机和通用 CaseState 不需要大规模推翻，但新增 pathway 仍会触及多个共享模块。扩展新 pathway 前应把 semantic extractor、disposition strategy、patient warning 和 department mapping 下沉到 versioned pathway/plugin contract。

## 10. Readiness Decision

最终判定：

> **PASS_WITH_CONDITIONS**

当前 Phase 1 Core 已达到进入 **LLM Semantic Extraction Integration** 的最低工程条件，但仅限：

1. LLM 只作为结构化事实候选抽取器，不得直接决定 disposition 或修改 safety policy。
2. LLM 输出必须经过逐 pathway Schema、枚举和字段白名单验证。
3. 对 unknown、refused、conflicting 和低置信度输出必须允许 abstain。
4. 先以 shadow mode 与确定性抽取并行，对差异进行审计，不直接替换现有安全路径。
5. 10 条 Safety Invariant 和完整回归测试必须继续作为阻断式门禁。
6. 在扩大症状范围或面向真实用户之前，完成两条 pathway 的临床专家审核。

因此：

- 是否建议进入 LLM Integration：**是，有条件建议**
- 是否建议开始 UI、HTTP API、数据库、RAG 或新 pathway：**否**
- 是否可以认为产品已经具备临床安全性：**否**
