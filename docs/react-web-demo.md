# React Web Demo — 比赛展示界面

## 1. 前端架构

React Web Demo 是一个位于 web/ 的独立 Vite 应用，只依赖 Phase 4 公开 HTTP API。

~~~text
React Chat UI（5173）
  → Demo API Client（/api）
     → Vite 开发代理
        → Phase 4 Demo API（8003）
           → 既有 Node.js Agent Core
              → 可选 Python LightRAG Service
~~~

- web/src/App.jsx：三栏比赛界面、会话复用、固定案例回放和只读 Agent 状态编排；
- web/src/api/demo-api.js：Phase 4 API 的唯一前端访问边界；
- web/src/styles.css：医疗风格、桌面与移动端响应式布局；
- web/src/*.test.*：API 路由、固定案例、多轮 session 复用和异常降级测试。

前端不导入 Node.js Core，不直接读写 CaseState，也不生成或修改风险结论。

## 2. API 连接与运行

开发环境默认把浏览器的 /api 请求代理至 http://127.0.0.1:8003，因此不需要修改现有 Demo API 或增加 CORS。可通过 web/.env 覆盖：

~~~dotenv
VITE_DEMO_API_BASE_URL=/api
VITE_DEMO_API_TARGET=http://127.0.0.1:8003
~~~

依次启动已有服务：

~~~powershell
npm run start:python-ai
npm run start:python-knowledge
npm run start:demo
npm run start:web
~~~

打开 http://127.0.0.1:5173。如果只演示高风险胸痛的确定性安全升级，可以在 Python 服务不可用时运行；完整头痛、模糊胸痛和 RAG 来源展示需要既有 Python 服务正常运行。

## 3. 页面与演示案例

页面采用现代 AI Chat 风格三栏布局：

1. 左栏：普通头痛、模糊胸痛、高风险胸痛三个一键案例，以及“用户症状 → Agent 追问 → 风险判断 → 安全回复 → 知识支持”流程提示；
2. 中栏：多轮 Chat、紧急安全 Banner、结构化 Agent 回复和可聚焦输入框的追问 Question Card；
3. 右栏：风险等级 Badge、通过既有 session API 读取的 CaseState、Safety Core 状态、Semantic Gate 统计、RAG 状态及来源卡片。

![Medical Agent React Web Demo](images/react-web-demo.png)

截图展示比赛首页的三栏状态：左侧可快速切换固定案例，中间完整呈现多轮医疗对话，右侧同步展示 Agent 的安全决策链。顶部阶段指示器帮助评委直观看到从症状输入到知识支持的处理过程。运行任一案例后，所有状态均使用 Demo API 返回值同步更新。

## 4. 安全边界

- Safety Core、CaseState、Semantic Gate、Multi-turn Loop、Response Layer 和 LightRAG 服务均未修改；
- 前端只渲染服务端返回的结构化安全回复；
- CaseState 面板只通过既有 GET session API 读取，不向后端写入或伪造状态；
- RAG 状态与来源单独展示，不参与或覆盖 riskLevel；
- API 或 RAG 异常时显示明确降级状态，不编造医学内容；
- 页面持续提示本系统不构成医疗诊断或治疗建议。

## 5. 验证

~~~powershell
npm run test:all
npm run test:coverage
~~~

最终验证结果：

- Node.js：282/282；
- Python：19/19；
- React/Vitest：6/6；
- Phase 1 Safety Invariants：10/10；
- Vite 生产构建：通过；
- Node.js 覆盖率：行 93.57%、分支 82.48%、函数 93.60%。
