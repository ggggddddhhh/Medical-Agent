# Medical-Agent

一个以安全裁决为核心、支持证据定位、多轮追问、工具调用和知识增强的医疗智能体 MVP。

> [!WARNING]
> 本项目是工程研究与比赛演示，不是医疗器械，不提供诊断、处方或个性化用药建议，也不能替代医生或急救服务。出现紧急症状时请立即联系当地急救服务。

![Medical-Agent React Demo](docs/images/react-web-demo.png)

## 项目定位

Medical-Agent 回答的是“下一步应该采取什么行动”，而不是“患了什么病”。系统将确定性的 Node.js 安全核心与可替换的 Python AI/RAG 服务分离：模型负责结构化语义和知识检索，CaseState、风险等级、临床路径与最终安全裁决始终由 Node.js 掌握。

当前 MVP 仅支持成年人场景中的两个临床路径：

- 头痛（HEADACHE_V1）
- 胸痛（CHEST_PAIN_V1）

比赛工程状态：Phase 2A 已完成语义稳健性验证，Phase 2B/2C 已打通多轮 Agent 与安全响应层，Phase 3 已接入 LightRAG + BAAI/bge-m3，Phase 4 已提供 React Demo。该状态不代表临床验证或真实世界部署许可。

项目适合用于医疗安全智能体架构研究、语义 Gate 评测、比赛演示和失效安全设计验证；不适合直接处理真实患者数据，也不能作为临床诊断或急救决策系统部署。

## 核心能力

- Evidence Span Finder：先定位用户原文证据，再形成 Clinical Fact
- Linguistic Assertion：独立判断主体、否定、确定性、时态、引用与假设
- Semantic Gate：对 ACCEPT / UNCERTAIN / REJECT 进行保守裁决
- Multi-turn Agent Loop：追问后更新同一份 CaseState 并重新评估安全
- Safety Core：危险信号优先、风险单调、工具失败安全降级
- Response Layer：把内部决策转换为受约束的用户回复
- LightRAG Knowledge Service：仅提供健康教育上下文和审核来源
- Decision Trace：保留结构化决策记录，不记录隐藏思维链
- React Demo：展示风险、CaseState、Semantic Gate、Safety Core 与 RAG 状态

## 架构

~~~mermaid
flowchart LR
    U[用户 / React Demo] --> D[Node.js Demo API]
    D --> A[Multi-turn Agent Loop]
    A --> S[Semantic Extraction]
    S --> G[Semantic Gate]
    G --> C[CaseState + Safety Core]
    C --> P[Clinical Pathway]
    P --> R[Response Layer]
    R --> U
    S -. HTTP .-> AI[Python AI Service]
    R -. 仅知识支持 .-> K[Python LightRAG Service]
    K --> E[BAAI/bge-m3 Embedding API]
~~~

Node.js 是临床决策权威；Python 服务不能修改 CaseState、riskLevel、Disposition 或 Safety Core 结果。详细边界见 [架构说明](docs/architecture.md)。

## Quick Start

### 1. 环境要求

- Node.js 22 或更高版本
- Python 3.11 或更高版本（推荐 3.12）
- DeepSeek API Key
- 支持 OpenAI-compatible embeddings 的 BAAI/bge-m3 服务

### 2. 安装依赖

~~~powershell
git clone <your-repository-url>
cd Medical-Agent

npm ci --prefix web

py -3.12 -m venv .venv
..venvScriptspython -m pip install --upgrade pip
..venvScriptspython -m pip install -r python_knowledge_service/requirements.txt
~~~

macOS/Linux 使用 python3 创建虚拟环境，并将解释器路径替换为 .venv/bin/python。

### 3. 配置环境变量

~~~powershell
Copy-Item .env.example .env
Copy-Item web/.env.example web/.env
~~~

至少填写：

- DEEPSEEK_API_KEY
- EMBEDDING_BASE_URL
- EMBEDDING_API_KEY
- EMBEDDING_MODEL=BAAI/bge-m3

启动脚本会自动读取根目录 .env；Vite 会自动读取 web/.env。两个真实文件均已被 Git 忽略。

### 4. 启动完整 Demo

在四个终端中依次运行：

~~~powershell
npm run start:python-ai
npm run start:python-knowledge
npm run start:demo
npm run start:web
~~~

| 服务 | 默认地址 | 作用 |
| --- | --- | --- |
| React Web | http://127.0.0.1:5173 | 比赛展示界面 |
| Python AI | http://127.0.0.1:8001 | 模型调用与语义抽取 |
| Python LightRAG | http://127.0.0.1:8002 | 医学知识检索 |
| Node.js Demo API | http://127.0.0.1:8003 | 完整 Agent 与 Demo API |

浏览器打开 http://127.0.0.1:5173。首次启动知识服务时会建立本地索引，耗时取决于模型服务；索引写入被忽略的 runtime/lightrag。

更完整的 Windows、macOS/Linux 步骤、健康检查和故障排查见 [Quick Start](docs/quick-start.md)。

## Demo 展示

三栏 React 界面把完整处理链放在同一屏：左侧选择固定案例，中间展示用户输入、Agent 回复与真实多轮追问，右侧同步显示 riskLevel、CaseState、Safety Core、Semantic Gate 和 RAG 来源。页面顶部截图即为当前比赛 Demo。

| 案例 | 预期结果 | RAG 行为 |
| --- | --- | --- |
| 普通头痛 | SELF_MONITOR | 最终处置后提供健康教育 |
| 模糊胸痛 | URGENT_SAME_DAY | 最终处置后提供胸痛知识 |
| 高风险胸痛 | EMERGENCY_NOW | 不等待 RAG，立即安全升级 |

操作脚本和评委讲解顺序见 [Demo 使用说明](docs/demo-guide.md)。

## Evaluation

所有结果均来自仓库中的封存数据和自动化测试，不是临床有效性结论。Phase 2A.4 使用 24 条全新 Blind Holdout，并对 6 条高风险病例重复 3 次；随后使用另一组 12 条独立 Subject Ambiguity Holdout 完成晋级验证。

| 阶段 | Critical Semantic Miss | Unsupported ACCEPT | Red Flag Safe Routing | Clarification Recall | Gate Drift | Holdout |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Phase 2A.4 Blind | 2 / 36 | 0 | 30 / 35（85.71%） | 10 / 13（76.92%） | 0 / 6 | 21 / 24（87.50%） |
| Subject Promotion | 0 | 0 | 17 / 17（100%） | 31 / 31（100%） | 0 / 4 | 12 / 12；20 / 20 executions |

Subject Promotion 的语言属性聚合结果：

| Evidence Span | Subject | Negation | Certainty | Temporality | Concept Mapping |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 30/34（88.24%） | 30/34（88.24%） | 30/34（88.24%） | 30/34（88.24%） | 29/34（85.29%） | 25/31（80.65%） |

该 Promotion 同时达到 Uncertainty Safe Routing 31/31、Hallucination Rejection 22/22，最终判定为 COMPETITION_READY_FOR_PHASE_2B。Verifier Accuracy 仅为 3/19（15.79%），因此 Verifier 继续只作为辅助证据；无原文证据时，即使 Verifier 支持也不能升级 ACCEPT。

详细数据见 [Phase 2A.4 报告](docs/phase-2a4-competition-semantic-repair.md)、[Subject Promotion 报告](docs/phase-2a-subject-promotion.md)及 [封存评测结果](evaluation/results/deepseek-v4-flash-phase-2a-promotion.json)。

## 测试

离线测试不需要真实 API Key：

~~~powershell
npm run test:all
npm run test:coverage
~~~

真实 Embedding 与 LightRAG 闭环需要完成 .env 配置：

~~~powershell
npm run test:rag:live
~~~

当前验证基线：

- Node.js：287/287
- Python：19/19
- React/Vitest：6/6
- Phase 1 Safety Invariants：10/10
- Node.js 行覆盖率：93.57%

## 目录结构

~~~text
.
├─ src/                         Node.js Agent Core 与 API 编排
├─ python_ai_service/           Python 模型传输服务
├─ python_knowledge_service/    LightRAG、Embedding 与知识库
├─ web/                         React + Vite Demo
├─ evaluation/                  数据集、冻结清单与脱敏结果
├─ test/                        Node.js 自动化测试
├─ scripts/                     启动、评测与 smoke test
├─ docs/                        架构、使用、安全与验证文档
└─ .github/workflows/           GitHub Actions
~~~

[文档导航](docs/README.md) 汇总了产品、安全、架构、Demo 和各阶段验证报告。

## 安全与隐私

- 不要提交 .env、API Key、runtime/、真实患者数据或带身份信息的日志
- Demo 请求与响应使用 Cache-Control: no-store
- RAG 请求不包含患者原文、CaseState 或风险结论
- RAG 无结果或服务异常时不编造内容，保留原始安全响应
- 高风险确定性结果不会因模型、工具或知识服务失败而降级

安全问题请通过 GitHub 私密安全报告渠道提交，详见 [SECURITY.md](SECURITY.md)。

## 贡献

提交改动前必须补充相关测试并确保全部验证通过；每次独立改动应对应一个 Git commit。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 发布状态与许可证

发布前审计见 [GitHub 发布检查报告](docs/github-release-report.md)和[最终发布清单](docs/github-release-checklist.md)。

本项目采用 [Apache License 2.0](LICENSE)。许可证不改变本项目“非医疗器械、非诊断工具、不得替代专业医疗服务”的产品安全边界。
