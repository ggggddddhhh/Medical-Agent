# Phase 1 Safety Invariants

本文档定义 Phase 1 确定性医疗安全内核必须始终成立的行为规则。“已覆盖”仅表示存在自动化行为测试，不代表已经完成临床验证或真实世界有效性验证。

## Invariant 清单

| ID | 必须成立的规则 | 主要执行层 | 自动化覆盖 | 状态 |
| --- | --- | --- | --- | --- |
| INV-001 | 明确的 emergency red flag 必须进入 **SAFETY_ESCALATION / EMERGENCY_NOW**；提示注入、诊断请求、用药请求和协议工具故障不能遮蔽急症 | Emergency Probe、Pathway Rules、Policy Engine | “INV-001 explicit emergency red flags always escalate”；“INV-001 emergency signals outrank...” 及协议故障测试 | 已覆盖 |
| INV-002 | 已进入 **EMERGENCY_NOW** 后，普通用户否认或“感觉好转”不得降级；较低终态收到修正后的明确急症信息时只能升级 | State Machine、Terminal Handler | 两项 INV-002 自动化测试 | 已覆盖 |
| INV-003 | 出现决定性危险信号后必须停止普通信息收集，安全相关信息优先于病例完整度 | Policy Engine、Agent Orchestrator | “INV-003 decisive red flags stop ordinary questioning immediately” | 已覆盖 |
| INV-004 | 工具异常、空值、畸形、额外字段或恶意文本必须 fail safe，不得补造结果、随机切换工具或降低处置等级 | Tool Registry、Tool Result Validator、Fallback | INV-004 与 tool-failure-modes 测试 | 已覆盖 |
| INV-005 | 不支持的 pathway 不得进入自由问诊或通用医学回答 | Scope Detection、Policy Engine | INV-005 与 scope boundary 测试 | 已覆盖 |
| INV-006 | 当前版本不得提供个体化处方、药物选择、剂量或停换药决策 | Input Safety、Output Safety | INV-006 与 output candidate 测试 | 已覆盖 |
| INV-007 | Self-harm safety 必须抢占普通 Headache/Chest Pain 流程，包括已开始的临床会话 | Input Safety、State Machine | INV-007 自动化测试 | 已覆盖 |
| INV-008 | Prompt injection 不得修改 pathway、clinical policy 或 disposition | Input Safety、Emergency Priority | INV-008 自动化测试 | 已覆盖 |
| INV-009 | Safety Gate 不得允许回答与 disposition 矛盾，也不得允许诊断、剂量、虚假保证或无证据的医院信息 | Output Safety Gate | INV-009 自动化测试 | 已覆盖 |
| INV-010 | Decision Trace 必须结构化、版本化，并且不得记录完整原始用户文本、隐藏推理或 Chain-of-Thought | Audit Layer | INV-010 与 audit 测试 | 已覆盖 |

## 状态说明

- Safety Invariant 数量：**10**
- 有自动化测试覆盖：**10**
- 无自动化测试覆盖：**0**
- 临床专家独立确认：**尚未完成**
- 真实 LLM 条件下重新验证：**尚未完成**

## 变更规则

任何 CaseState、Pathway、Policy、Tool、Safety Gate、模型抽取器或输出模板变更，都必须：

1. 标明可能影响的 invariant；
2. 更新或增加对应行为测试；
3. 运行完整回归测试；
4. 不得以提高测试通过率为由降低 emergency 规则；
5. 若无法证明 invariant 仍成立，必须阻止进入下一阶段或标记为 P0。
