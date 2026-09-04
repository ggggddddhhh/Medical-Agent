# Phase 5 — Memory Layer

## 目标与边界

Phase 5 参考 LangGraph 的 thread/checkpoint/store 设计思想，但不引入 LangGraph。它作为现有 Phase 3 Agent 外层的轻量装饰器，提供会话恢复、Fact Memory 和 Question Planner；Safety Core、CaseState schema、Semantic Gate、Clinical Pathway 和原有 Agent 主流程均保持不变。

Memory 不能直接写入 CaseState、创建 Clinical Fact、改变 riskLevel 或覆盖 Safety Core。所有恢复后的用户输入仍经过原有 Semantic Extraction、Semantic Gate 和 Safety Core。

## 架构

~~~text
React / Demo API
        ↓
Phase 5 Memory Layer
  ├─ Session Manager：sessionId、消息历史、逐轮 CaseState 快照
  ├─ Fact Memory：从 CaseState 只读投影已确认事实
  └─ Question Planner：过滤已回答字段并规划下一缺失字段
        ↓
原有 Phase 3 → Phase 2C → Phase 2B → Safety Core
~~~

### Session Manager

- 默认将每个 sessionId 保存为 `runtime/memory/<sessionId>.json`；目录已被 Git 忽略。
- 检查点包含初始上下文、历史消息、逐轮 CaseState 快照、当前 pending clarification、Fact Memory 和问题记录。
- 使用受限 sessionId 文件名和临时文件替换，避免路径穿越与半写入文件。
- `MEMORY_STORAGE_DIR` 可覆盖本地目录。

### Fact Memory

Fact Memory 只读取 CaseState 的 `factMetadata` 与 chief complaint。仅 `known` 事实进入 confirmed facts；`known` 和 `refused` 字段进入已回答集合。冲突或未知事实不会被当作已确认事实。

### Question Planner

Question Planner 按以下顺序工作：当前未解决 clarification、成人确认、当前 Clinical Pathway 中第一个未回答字段。规划前会过滤 Fact Memory 中已回答的 factPath，因此恢复会话后不会再次询问已经确认的字段。它不创建新医学规则，也不替代 Safety Core 的最终问题与处置裁决。

## 会话恢复

接口：

- `POST /v1/demo/sessions/{sessionId}/resume`：显式恢复检查点；
- `POST /v1/demo/sessions/{sessionId}/messages`：若进程重启且本地尚未激活该 session，会自动尝试恢复；
- `GET /v1/demo/sessions/{sessionId}/history`：读取当前已激活会话的消息历史。

未完成追问需要恢复 Agent 内部 pending 状态。Phase 5 不直接注入内部状态，而是以原 sessionId 和初始上下文重放该会话的用户消息，使每条消息重新经过原有完整流程。重放结束后必须与已保存 CaseState 和 pending clarification 完全一致；若不一致，返回 `SESSION_RESTORE_DRIFT` 并拒绝继续，避免在语义漂移下错误关联患者回答。已结束或无 pending 的会话直接使用原有 CaseState restore 能力。

## 失败与医疗隐私

- 写盘失败只把 Memory 标记为 unavailable，不能降低或阻断 Safety Core 的紧急升级。
- 检查点损坏、缺失或恢复漂移时 fail closed，不猜测用户回答属于哪个问题。
- `runtime/memory` 含医疗对话原文，不应提交 Git，也不适合直接用于生产环境。
- 生产部署必须另行增加加密、访问控制、审计、保留期限、用户删除机制和适用地区的医疗隐私合规措施。

## 验证范围

- pending 会话跨实例恢复并继续到下一问题；
- 已回答字段不会重复追问；
- 恢复后的高风险肯定回答仍触发 `EMERGENCY_NOW`；
- Memory 持久化故障不改变 Safety Core 结论；
- Safety Core、Semantic Gate 和已有两个 Pathway 保持字节级不变。
