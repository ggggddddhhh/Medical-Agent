# Medical Safety Agent MVP

这是一个面向成年人的、限定症状范围的安全分诊与就医准备智能体内核。目前仅支持：

- 头痛（`HEADACHE_V1`）
- 胸痛（`CHEST_PAIN_V1`）

系统回答的问题是“下一步应采取什么行动”，而不是“患了什么病”。当前版本不提供诊断、处方、个性化药物剂量、儿童问诊或长期病史管理。

## 核心能力

- Session 级结构化 `CaseState`
- 按临床路径动态选择下一项问题
- 出现危险信号时立即停止普通追问
- 只读白名单工具调用
- 输入和输出安全门
- 结构化 `Decision Trace`，不记录隐藏思维链
- 确定性协议与完整回归测试

## 快速运行

```powershell
npm test
npm run test:coverage
```

## 最小示例

```js
import { MedicalSafetyAgent } from "./src/index.js";

const agent = new MedicalSafetyAgent({ deploymentRegion: "CN" });
const sessionId = agent.startSession({ adultConfirmed: true });

const first = agent.handleMessage(sessionId, "我头很痛");
const second = agent.handleMessage(sessionId, "突然一下就非常痛，是最严重的一次");

console.log(first.question?.text);
console.log(second.disposition); // EMERGENCY_NOW
```

## 安全边界

智能体只允许在以下动作之间转换：

- `ASK_MORE`
- `CALL_TOOL`
- `DISPOSITION`
- `SAFETY_ESCALATION`
- `OUT_OF_SCOPE`
- `INSUFFICIENT_INFO`

协议、规则、模型和工具版本都会写入审计轨迹。新增症状路径时，必须同时增加对应的正常路径、危险信号、语义改写、越界和工具失败测试。

## Phase 1 验证

- [Safety Invariants](docs/safety-invariants.md)
- [Phase 1 Core Validation Report](docs/phase-1-validation-report.md)

当前验证结论为 **PASS_WITH_CONDITIONS**：可以有条件进入 LLM 结构化语义抽取集成，但不能据此开始临床部署、扩展症状范围或宣称已经验证自然语言理解能力。
