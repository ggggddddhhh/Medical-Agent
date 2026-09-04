# Demo 使用说明

## 1. 演示目标

React Demo 用于向评委展示一条完整、可解释的安全流程：

~~~text
用户症状
  → Evidence 与 Semantic Gate
  → 多轮追问
  → CaseState 更新
  → Safety Core 风险裁决
  → 安全回复
  → 可选 RAG 健康教育与来源
~~~

界面不会自行计算风险。右侧面板中的 CaseState、Safety Core、Semantic Gate 与 RAG 状态均来自后端公开 API。

## 2. 演示前检查

1. 按 [Quick Start](quick-start.md) 启动 8001、8002、8003 和 5173 四个服务。
2. 确认三个后端 /health 均可访问。
3. 打开 http://127.0.0.1:5173。
4. 确认页面右上角显示“服务已连接”。
5. 每次切换正式演示案例前点击“新会话”，避免旧状态干扰讲解。

如果只展示确定性安全升级，高风险胸痛可以在 Python 服务不可用时运行；普通头痛和模糊胸痛的完整语义/RAG 展示需要两个 Python 服务正常。

## 3. 界面区域

### 左侧：演示场景

- 普通头痛
- 模糊胸痛
- 高风险胸痛

下方流程提示展示 Evidence + Assertion、安全裁决和只读 LightRAG 三层关系。

### 中间：多轮 Chat

- 用户原始输入
- Agent 结构化回复
- 高风险安全 Banner
- 可操作的追问 Question Card
- 沿用当前 sessionId 的回答输入框

### 右侧：Agent 状态

- 风险等级 Badge
- CaseState 状态、事实数量和轮次
- Safety Core 是否处于保护状态
- Semantic Gate 的 ACCEPT / UNCERTAIN / REJECT 数量
- RAG 是否调用、是否降级以及审核来源

## 4. 三个固定案例

### 案例 A：普通头痛

操作：点击“普通头痛”，等待固定多轮回放结束。

预期：

- Agent 逐项询问既有头痛路径中的关键信息；
- 最终风险为 SELF_MONITOR；
- Response 给出居家观察与危险信号提示；
- 策略允许时调用 RAG，右侧显示头痛健康教育来源；
- RAG 内容不能改变 SELF_MONITOR。

讲解重点：多轮状态连续、否定信息写入同一 CaseState、知识层只做解释。

### 案例 B：模糊胸痛

操作：点击“模糊胸痛”，观察多轮追问和最终状态。

预期：

- 初始描述不足以直接形成完整结论；
- Agent 继续追问胸痛相关危险信号与时态；
- 最终风险为 URGENT_SAME_DAY；
- 策略允许时调用 RAG，展示胸痛知识来源；
- 若 8002 不可用，显示 unavailable / 知识服务已降级，但风险仍保持 URGENT_SAME_DAY。

讲解重点：宁可追问而不猜测；RAG 异常只影响知识展示。

### 案例 C：高风险胸痛

操作：点击“高风险胸痛”。

预期：

- 明确危险信号触发 EMERGENCY_NOW；
- 普通追问立即停止；
- 页面显示醒目的紧急安全 Banner 和下一步行动；
- RAG 状态为 not_requested，不等待知识服务。

讲解重点：Safety Core 优先级最高，模型与 RAG 不参与降低或延迟急救裁决。

## 5. 自由多轮演示

1. 点击“新会话”。
2. 输入当前支持范围内的头痛或胸痛描述。
3. 根据 follow-up question 回答。
4. 观察右侧轮次、事实数量与 Semantic Gate 变化。
5. 直到进入最终风险状态或信息不足状态。

请只使用虚构演示文本，不输入真实姓名、联系方式、病历号或其他个人健康信息。

## 6. RAG 状态解释

| UI 状态 | 含义 | 是否影响风险 |
| --- | --- | --- |
| AVAILABLE | 返回通过 Knowledge Guard 的审核片段与来源 | 否 |
| NO_RESULTS | 没有可用知识结果，不生成内容 | 否 |
| UNAVAILABLE | 服务、模型或 Embedding 异常，已安全降级 | 否 |
| NOT_REQUESTED | 急诊或策略不需要知识增强 | 否 |

## 7. 建议的五分钟讲解顺序

1. 用 30 秒说明 Node.js 掌握最终安全裁决，Python 只提供 AI/RAG 能力。
2. 运行模糊胸痛，展示真实多轮追问与 CaseState 更新。
3. 展示最终 URGENT_SAME_DAY 和独立的 RAG 来源卡片。
4. 运行高风险胸痛，展示危险信号立即中断普通追问。
5. 关闭或模拟知识服务异常，说明风险结论不变的安全降级设计。

## 8. 演示边界

- 固定案例是工程演示，不是真实患者建议；
- 当前只支持成年人头痛与胸痛；
- 不展示诊断、处方或个性化剂量；
- 不能将比赛验证结果描述为临床有效性；
- UI、RAG 或外部模型都不能覆盖 Safety Core。
