# GitHub 最终发布清单

检查日期：2026-09-04

## 仓库内容

- [x] 根目录包含标准 Apache License 2.0；
- [x] package.json 声明 Apache-2.0；
- [x] README 包含项目定位、架构、Demo、Evaluation、Quick Start 与安全声明；
- [x] 架构、快速启动、Demo 和文档导航均可从 README 到达；
- [x] SECURITY.md 与 CONTRIBUTING.md 已提供；
- [x] GitHub Actions 只运行离线测试，不读取仓库 secrets。

## 凭据与隐私

- [x] 当前跟踪文件中未发现 API Key 或 Token；
- [x] 全部现有 Git 历史内容中未发现 API Key 或 Token；
- [x] .env、web/.env 与其他环境变量实值文件未被跟踪；
- [x] 当前跟踪文件中未发现邮箱正文或私人本地绝对路径；
- [x] 固定案例和封存结果不包含真实患者身份信息；
- [x] runtime/、.venv/、node_modules/、dist/、缓存和日志均被忽略；
- [ ] 仓库所有者确认现有 Git author 邮箱可以公开，或在 push 前完成 noreply 处理。

## 验证

- [x] Node.js 287/287；
- [x] Python 19/19；
- [x] React/Vitest 6/6；
- [x] Phase 1 Safety Invariants 10/10；
- [x] Vite 生产构建通过；
- [x] Node.js 覆盖率：行 93.57%、分支 82.52%、函数 93.60%；
- [x] 发布就绪性测试 5/5；
- [x] 核心 src/ 与 Python/Web 服务实现未修改。

## GitHub 外部操作

- [ ] 创建 GitHub 远程仓库；
- [ ] 配置 origin remote；
- [ ] 推送默认分支；
- [ ] 启用 Private vulnerability reporting；
- [ ] 启用默认分支保护和 CI 必须通过规则；
- [ ] 创建 v0.1.0-demo 预发布版本（建议）。

本轮明确不创建远程仓库、不配置 remote、不执行 git push。勾选外部操作前，应先完成 Git author 邮箱隐私确认。
