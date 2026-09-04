# GitHub 发布检查报告

检查日期：2026-09-04

结论：代码、许可证与工作树内容已具备公开条件；正式公开前仍需仓库所有者确认提交作者邮箱隐私并配置 GitHub remote。

## 1. 审计范围

- Git 当前跟踪文件；
- 全部本地 Git 提交历史中的文本内容；
- 环境变量模板与启动脚本；
- 评测结果、文档、截图和知识库；
- 本地缓存、虚拟环境、构建目录与运行数据；
- 新用户安装、配置、启动与 Demo 路径。

## 2. 凭据与隐私检查

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| API Key / Token 模式 | 通过 | 当前跟踪内容与 Git 历史均未发现常见真实凭据模式 |
| .env 文件 | 通过 | 真实 .env 被忽略，仅跟踪空值模板 |
| 用户邮箱正文 | 通过 | 当前跟踪内容与 Git 历史未发现邮箱地址 |
| 本地绝对路径 | 通过 | 当前跟踪内容与 Git 历史未发现用户目录或工作区绝对路径 |
| 患者隐私数据 | 通过 | 固定案例与评测结果使用工程测试数据；脱敏结果测试禁止原文、prompt 与 hidden reasoning |
| 开源许可证 | 通过 | 根目录使用 Apache License 2.0，package.json 声明 Apache-2.0 |
| 提交作者邮箱 | 需要确认 | Git commit metadata 中存在 g***@outlook.com，推送后可能公开 |

提交作者邮箱属于 Git 元数据，不会被 .gitignore 移除。若不希望公开，应在首次 push 前决定是否使用 GitHub noreply 邮箱并重写历史；历史重写属于破坏性操作，本次未自动执行。

## 3. 临时文件与目录

本地存在但未被跟踪：

- .venv/
- runtime/
- Python __pycache__/
- web/node_modules/
- web/dist/

.gitignore 已覆盖上述目录，并增加操作系统、编辑器、Python 测试缓存和包管理器日志规则。当前没有已跟踪的 node_modules、dist、coverage、runtime、虚拟环境、日志、pyc 或 tmp 文件。

## 4. 大文件

仓库存在两份大于 1 MiB 的脱敏评测结果：

- evaluation/results/deepseek-v4-flash-phase-2a2.json：约 1.42 MiB
- evaluation/results/deepseek-v4-flash-phase-2a3.json：约 5.54 MiB

两者低于 GitHub 单文件限制，并由冻结清单与脱敏测试用于评测可复核性。当前建议保留；若未来评测结果持续增长，可迁移到 GitHub Release artifact 或对象存储，但需同时调整冻结验证。

## 5. 可复现性改进

- 根目录 .env.example 已区分必需配置、可选解释器与服务端口；
- Node 启动脚本自动读取 .env；
- Python AI、Knowledge 和测试启动器优先发现项目 .venv；
- README 提供从 clone 到 React Demo 的最短路径；
- docs/quick-start.md 提供跨平台安装、健康检查与故障排查；
- docs/architecture.md 明确 Node/Python/RAG/UI 的安全边界；
- docs/demo-guide.md 提供三个比赛案例和讲解顺序；
- GitHub Actions 在无真实密钥条件下执行完整离线测试和覆盖率。

## 6. 发布前待办

### 必须完成

1. 确认 commit author 邮箱是否可以公开；如不可以，先配置 GitHub noreply 邮箱并评估历史重写。
2. 在 GitHub 创建仓库并配置 origin remote；当前本地仓库没有 remote。

### 建议完成

1. 启用 Private vulnerability reporting。
2. 启用默认分支保护，要求 CI 通过后才能合并。
3. 在仓库 About 中明确“research/demo, not medical advice”。
4. 首次发布使用预发布版本号，例如 v0.1.0-demo。
5. 不要为 GitHub Actions 配置真实模型密钥；当前 CI 只运行离线验证。

## 7. 最终验证

- 公开仓库就绪性测试：5/5；
- Node.js：287/287；
- Python：19/19；
- React/Vitest：6/6；
- Phase 1 Safety Invariants：10/10；
- Vite 生产构建：通过；
- Node.js 覆盖率：行 93.57%、分支 82.52%、函数 93.60%。

## 8. 发布判定

当前判定：READY_FOR_GITHUB_WITH_EXTERNAL_ACTIONS。

从代码与内容安全角度，没有发现阻止公开的密钥、路径、PII 或临时文件；Apache-2.0 已加入。作者邮箱隐私和 remote 是正式公开前仍需所有者完成的外部动作。
