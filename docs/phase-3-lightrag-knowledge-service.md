# Phase 3 — Python LightRAG Knowledge Service

## 1. 目标与结论

Phase 3 在不改动既有 Node.js 医疗安全核心的前提下，引入独立 Python 知识服务。它只向最终回复补充经审核的医学解释、健康教育片段和来源，不参与诊断，也不能改变 `CaseState`、`Risk Decision`、处置建议或安全裁决。

## 2. 架构

```text
用户输入
  -> Node.js Agent Core
     -> Semantic Gate / CaseState / Safety Core / Pathway
     -> Risk Decision / Response Layer
     -> KnowledgeSupportPolicy（只读，判断是否需要知识支持）
        -> POST /v1/knowledge/query
           -> Python LightRAG Service
              -> BAAI/bge-m3 Embedding
              -> LightRAG context-only retrieval
              -> 审核来源目录映射
        <- 知识片段与来源
     -> KnowledgeResponseGuard（白名单、逐字段和逐字内容校验）
  -> 用户回复
```

新增的 `KnowledgeEnrichedAgent` 是 Phase 2C Response Layer 外部的薄包装器。Phase 3 冻结测试对 Safety Core、Semantic Gate、Clinical Pathway、Phase 2B 多轮循环和 Phase 2C Response Layer 做 SHA-256 校验，确保这些文件相对基线提交 `11424df8a0124a040cba5ed24a33fd54840d61f8` 保持不变。

## 3. Node.js 与 Python 边界

Node.js 继续独占：

- `CaseState` 和会话更新；
- Semantic Gate、Safety Core、Clinical Pathway；
- Decision Trace、Risk Decision、Response Layer；
- 是否调用知识服务，以及返回内容能否展示的最终权限。

Python 只负责：

- LightRAG 初始化、索引和检索；
- 使用 `BAAI/bge-m3` 生成 Embedding；
- 小规模审核知识库管理；
- 返回候选知识来源，不接收患者原文、`CaseState` 或风险结论。

LightRAG 查询采用 `only_need_context=True`。系统不使用 LightRAG 生成的医疗答案，而只解析检索上下文中的 `SOURCE_ID`，再从本地审核目录中取出固定片段。未知 ID、重复 ID 和被篡改内容均被丢弃。

## 4. Python 服务结构

```text
python_knowledge_service/
  app.py                  REST 服务、请求验证和安全错误响应
  catalog.py              审核知识目录加载、验证和材料化
  lightrag_backend.py      LightRAG 适配器与 context-only 查询
  knowledge_base.json     小规模审核语料
  requirements.txt        lightrag-hku==1.5.7
  tests/                   Python 单元与 HTTP 契约测试
```

Embedding 固定为：

- 模型：`BAAI/bge-m3`
- 向量维度：`1024`
- 最大 token 数：`8192`
- 调用方式：OpenAI-compatible Embedding API

服务会验证模型名和维度；不允许通过环境变量静默切换到其他模型。缺少 Embedding endpoint 或密钥时，服务以 `degraded` 启动，查询返回 503，Node.js 保留原始安全回复并标记知识支持不可用。

## 5. REST API

### `GET /health`

返回服务版本、LightRAG 就绪状态、语料版本和文档数。`status=degraded` 表示知识增强不可用，不影响 Node.js 安全核心工作。

### `POST /v1/knowledge/query`

请求仅允许三个字段：

```json
{
  "topic": "headache",
  "intent": "health_education",
  "limit": 2
}
```

- `topic`：仅 `headache` 或 `chest_pain`；
- `intent`：仅健康教育、医学解释或参考支持；
- `limit`：1 到 3。

明确禁止传入患者原话、临床事实、CaseState、Risk Decision 或处置字段。成功响应：

```json
{
  "serviceVersion": "python-lightrag-knowledge-service-0.1.0",
  "status": "available",
  "corpusVersion": "medical-education-mini-corpus-0.1.0",
  "items": [
    {
      "sourceId": "NHS_HEADACHE_2024",
      "title": "Headaches",
      "url": "https://www.nhs.uk/symptoms/headaches/",
      "reviewedAt": "2024-04-17",
      "snippet": "..."
    }
  ]
}
```

检索没有审核结果时必须返回 `status=no_results` 且 `items=[]`，不得由模型补写内容。

## 6. 小规模知识库

当前语料只覆盖既有两条 Clinical Pathway 的一般健康教育：

| 来源 ID | 主题 | 权威来源 |
| --- | --- | --- |
| `NHS_HEADACHE_2024` | 头痛 | NHS Headaches |
| `CDC_STROKE_SIGNS_2026` | 头痛/卒中危险信号教育 | CDC Signs and Symptoms of Stroke |
| `CDC_HEART_ATTACK_2024` | 胸痛/心脏病发作危险信号教育 | CDC About Heart Attack |

`knowledge_base.json` 保存审核后的固定中文摘要、原始 HTTPS URL 和审核日期。更新语料必须经过人工审核，同时同步 Python catalog、Node.js 白名单、语料版本和两端测试；LightRAG 检索结果本身不能直接成为面向用户的医学事实。

## 7. 安全边界与降级

- 只有非急诊的最终 `DISPOSITION` 才会请求知识支持；`ASK_MORE`、急诊、越界和信息不足均不调用。
- Python 请求不含患者文本、CaseState、临床事实、风险等级或处置结果。
- Python 响应若含风险字段、未知来源、额外字段或与审核目录不一致的内容，Node.js 整体拒绝。
- RAG 超时、503、无效 JSON、未安装、未配置或无结果时，不编造内容，不影响基础医疗回复。
- 知识服务调用前后对 CaseState 做指纹比较；知识结果没有写状态的接口。
- Verifier、Semantic Gate 和 Safety Core 权限没有变化。

## 8. 配置与运行

安装依赖：

```powershell
python -m pip install -r python_knowledge_service/requirements.txt
```

至少配置 `LIGHTRAG_EMBEDDING_API_KEY` 和 `LIGHTRAG_EMBEDDING_BASE_URL`；LLM 默认读取已有 `DEEPSEEK_API_KEY`。然后分别启动：

```powershell
npm run start:python-knowledge
npm run start:agent-api
```

若 BGE-M3 由本地 OpenAI-compatible 服务提供，`LIGHTRAG_EMBEDDING_BASE_URL` 指向该服务地址；模型名仍必须为 `BAAI/bge-m3`。

## 9. 验证

- Phase 3 Node.js 知识层专项测试：8/8；
- Python 服务测试：12/12（原 Python AI Service 4 项 + LightRAG Knowledge Service 8 项）；
- 完整 Node.js tests：269/269；
- Phase 1 Safety Invariants：10/10；
- Node.js 覆盖率：行 93.68%、分支 82.53%、函数 93.38%；
- 已在隔离虚拟环境中安装并导入 `lightrag-hku==1.5.7`，核验初始化、插入、查询和存储生命周期 API；
- 缺少 BGE-M3 endpoint 时的本地 HTTP smoke test：`/health` 返回 `degraded`，查询返回安全的 503，不包含知识内容；
- 结论仅表示工程安全边界与回归测试通过，不代表临床验证或真实世界部署许可。
