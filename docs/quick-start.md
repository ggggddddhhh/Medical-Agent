# Quick Start

本指南从全新 clone 开始，完成依赖安装、环境变量配置、四个本地服务启动与 React Demo 验证。

## 1. 前置条件

- Git
- Node.js 22+
- npm
- Python 3.11+（推荐 3.12）
- DeepSeek API Key
- OpenAI-compatible Embedding API，模型必须为 BAAI/bge-m3，输出维度 1024

检查版本：

~~~powershell
git --version
node --version
npm --version
py --version
~~~

macOS/Linux 使用 python3 --version。

## 2. 获取代码

~~~powershell
git clone <your-repository-url>
cd Medical-Agent
~~~

## 3. 安装依赖

### Windows PowerShell

~~~powershell
npm ci
npm ci --prefix web

py -3.12 -m venv .venv
..venvScriptspython -m pip install --upgrade pip
..venvScriptspython -m pip install -r python_knowledge_service/requirements.txt
~~~

### macOS/Linux

~~~bash
npm ci
npm ci --prefix web

python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r python_knowledge_service/requirements.txt
~~~

Python AI Service 只使用标准库；requirements.txt 安装的是 LightRAG Knowledge Service 所需依赖。项目启动器会自动优先发现根目录 .venv，也可用 PYTHON_EXECUTABLE 显式覆盖。

## 4. 配置环境变量

### Windows PowerShell

~~~powershell
Copy-Item .env.example .env
Copy-Item web/.env.example web/.env
~~~

### macOS/Linux

~~~bash
cp .env.example .env
cp web/.env.example web/.env
~~~

编辑根目录 .env，至少配置：

~~~dotenv
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com

EMBEDDING_BASE_URL=https://your-provider.example/v1
EMBEDDING_API_KEY=your-key
EMBEDDING_MODEL=BAAI/bge-m3
~~~

EMBEDDING_BASE_URL 可以是 API 的 v1 基地址，也可以直接以 /embeddings 结尾；服务会在需要时自动补上 /embeddings。不要给 BAAI/bge-m3 配置其他维度，本项目固定验证 1024 维与 8192 tokens。

LIGHTRAG_LLM_API_KEY 留空时会回退使用 DEEPSEEK_API_KEY。不要提交填好的 .env 或 web/.env。

Phase 5 默认把会话检查点写入 `runtime/memory`。可通过 `MEMORY_STORAGE_DIR` 更换目录；其中包含医疗对话原文，只应保存在受控环境中，且不能提交到 Git。

Phase 5.2 默认保持 Legacy 流程：

~~~dotenv
AGENT_ORCHESTRATOR=legacy
~~~

可选值为 `legacy`、`shadow`、`langgraph`。建议先使用 `shadow` 观察 Planner 对比；`langgraph` 只接管 Fact Memory reconcile、Question Planner 和经过既有 Clinical Pathway 校验的 pending question。配置变更后需要重启 Node.js Demo API。

## 5. 启动服务

按顺序打开四个终端，并保持每个进程运行。

### 终端 1：Python AI Service

~~~powershell
npm run start:python-ai
~~~

监听 http://127.0.0.1:8001。

### 终端 2：Python LightRAG Knowledge Service

~~~powershell
npm run start:python-knowledge
~~~

监听 http://127.0.0.1:8002。首次启动会建立 runtime/lightrag 索引，可能需要数十秒到数分钟。

### 终端 3：Node.js Demo API

~~~powershell
npm run start:demo
~~~

监听 http://127.0.0.1:8003。

### 终端 4：React Web

~~~powershell
npm run start:web
~~~

浏览器打开 http://127.0.0.1:5173。

所有 Node 启动脚本都会读取根目录 .env；Vite 自动读取 web/.env。修改环境变量后必须重启对应服务。

Demo API 重启后，可继续向原 sessionId 的 messages 接口发送消息自动恢复，也可显式调用：

~~~powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8003/v1/demo/sessions/<sessionId>/resume
~~~

## 6. 健康检查

PowerShell：

~~~powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8002/health
Invoke-RestMethod http://127.0.0.1:8003/health
~~~

macOS/Linux：

~~~bash
curl http://127.0.0.1:8001/health
curl http://127.0.0.1:8002/health
curl http://127.0.0.1:8003/health
~~~

三个接口正常后再运行固定 Demo。若 8001 不可用，Semantic Gate 会显示 provider_error 并安全降级；若 8002 不可用，RAG 会显示 unavailable，但风险结论保持不变。

## 7. 验证

不需要真实 API 的离线测试：

~~~powershell
npm run test:all
npm run test:coverage
~~~

配置真实 Embedding 后的闭环 smoke test：

~~~powershell
npm run test:rag:live
~~~

## 8. 常见问题

### Port 5173 is already in use

Windows 查找占用进程：

~~~powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen
~~~

确认该 PID 属于本项目遗留 Vite 进程后再停止：

~~~powershell
Stop-Process -Id <PID>
~~~

不要直接结束未确认归属的进程。

### RAG 显示“知识服务已降级”

先访问 8002 的 /health。常见原因是知识服务未启动、Embedding 配置缺失、模型端点不可达或首次索引尚未完成。启动服务后需要创建新会话并重新运行案例，旧会话结果不会自动更新。

### Semantic Gate 显示 provider_error

检查 8001 的 /health、DEEPSEEK_API_KEY 和 DEEPSEEK_BASE_URL，并在修改 .env 后重启 Python AI Service。

### 找不到 Python

确认根目录 .venv 已创建。也可以在 .env 中设置：

~~~dotenv
PYTHON_EXECUTABLE=/path/to/python
PYTHON_KNOWLEDGE_EXECUTABLE=/path/to/python
~~~

Windows 路径可以指向 .venv/Scripts/python.exe；macOS/Linux 指向 .venv/bin/python。

## 9. 停止服务

在四个终端分别按 Ctrl+C。runtime/、.venv/、web/node_modules/ 和 web/dist/ 均已加入 .gitignore。
