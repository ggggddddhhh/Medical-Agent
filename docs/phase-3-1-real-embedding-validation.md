# Phase 3.1 — Real Embedding & Retrieval Validation

## 1. 结论

Phase 3.1 已打通真实闭环：

```text
审核医疗文档
  → OpenAI-compatible BAAI/bge-m3 Embedding API
  → LightRAG 索引
  → context-only 检索
  → 审核来源目录映射
  → Node.js Response Layer 知识增强
```

Node.js 的 `CaseState`、Semantic Gate、Safety Core、Clinical Pathway、Risk Decision 和 Response Layer 均保持冻结。RAG 仍然只有解释权，没有风险裁决权。

## 2. Embedding 接入

服务读取三项标准环境变量：

- `EMBEDDING_BASE_URL`：OpenAI-compatible API 基地址，客户端调用其 `/embeddings` 路径；
- `EMBEDDING_API_KEY`：仅放在 `Authorization: Bearer` 请求头中，不写日志；
- `EMBEDDING_MODEL`：固定为 `BAAI/bge-m3`。

适配器校验 HTTP(S) endpoint、响应 JSON、向量数量、index 顺序、有限数值和固定 1024 维；配置模型不是 BGE-M3、维度不是 1024、API 不可用或响应不合法时全部 fail closed。LightRAG 初始化使用独立 600 秒上限，单次 Embedding/检索仍使用较短超时。

## 3. 小规模知识库

语料版本为 `medical-education-mini-corpus-0.2.0`，共 5 篇人工审核条目：

| 主题 | 来源 |
| --- | --- |
| 头痛 | NHS Headaches |
| 卒中警示 | CDC Signs and Symptoms of Stroke |
| 胸痛/心脏事件 | CDC About Heart Attack |
| 胸痛 | MedlinePlus Chest Pain |
| 急救注意事项 | NHS When to call emergency services |

每个文档包含稳定 `SOURCE_ID`、主题、标题、HTTPS 来源、审核日期、固定中文摘要和关键词。LightRAG 只决定候选 `SOURCE_ID`；实际展示内容必须从本地批准目录重新材料化。

最新一次全新隔离索引结果为 5 个 chunks、47 个 entities、61 个 relationships；此前一次独立构建为 5/52/70。实体关系数量会随 LLM 图抽取发生变化，因此不作为安全通过条件；两次都使用 1024 维 BGE-M3，并且最终只展示批准目录中的固定内容。

## 4. 查询示例

请求：

```json
{
  "topic": "headache",
  "intent": "health_education",
  "limit": 3
}
```

真实 hybrid context 检索结果包括：

- 最新全新索引：头痛命中 `NHS_HEADACHE_2024`、`NHS_EMERGENCY_HELP_2023`，胸痛命中 `MEDLINEPLUS_CHEST_PAIN_2025`；
- 前一次独立索引：头痛命中 `NHS_HEADACHE_2024`、`CDC_STROKE_SIGNS_2026`，胸痛命中 `MEDLINEPLUS_CHEST_PAIN_2025`、`CDC_HEART_ATTACK_2024`。

没有批准来源时返回 `status=no_results` 和空 `items`，不调用模型补写。

## 5. Node.js → Python 联调

`npm run test:rag:live` 会：

1. 使用真实 Embedding API 初始化或加载 LightRAG 索引；
2. 对头痛、胸痛执行真实 context-only 检索；
3. 在本地临时端口启动真实 Python REST 服务；
4. 让 Phase 2C 基准 Agent 和 Phase 3 Agent 分别完成同一段七轮头痛问诊；
5. 由 Phase 3 Agent 调用 `POST /v1/knowledge/query`；
6. 比较两次 `Disposition`、reasoning 和去除随机 sessionId 后的完整 `CaseState`。

实测最终风险均为 `SELF_MONITOR`，知识支持返回批准的头痛来源，`caseStateUnchangedByRag=true`。

## 6. 异常与安全降级

- Embedding API 返回 503：初始化失败并进入不可用后端；
- Embedding 维度错误、数量错误或非法 JSON：拒绝该响应；
- LightRAG 查询异常：REST 返回 503 且不包含 `items`；
- 无匹配结果：返回空结果，不编造；
- Node.js 超时、503、无效 JSON、未知来源或越权字段：保留原始 Response Layer 回复，标记知识支持不可用；
- 请求体禁止患者原文、`CaseState`、riskLevel、disposition 和 diagnosis。

## 7. 验证命令

```powershell
npm run test:all
npm run test:coverage
npm run test:rag:live
```

验证结果：Node.js 271/271、Python 19/19、Phase 1 Safety Invariants 10/10；Node.js 覆盖率为行 93.69%、分支 82.53%、函数 93.38%；真实 RAG 与 Agent 联调均通过。

真实凭据仅从环境变量读取，测试与日志不输出 endpoint 或 API key。本验证是工程闭环与安全边界验证，不构成临床有效性证明或部署许可。
