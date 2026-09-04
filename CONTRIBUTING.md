# Contributing

感谢参与 Medical-Agent。任何贡献都必须保持“确定性安全核心拥有最终裁决”的架构边界。

## 开发流程

1. 从默认分支创建短生命周期分支。
2. 保持改动范围单一，不在同一提交混入无关重构。
3. 为每次行为改动新增或更新测试。
4. 在提交前运行完整验证。
5. 使用清晰、可追踪的 Git commit。

~~~powershell
npm run test:all
npm run test:coverage
~~~

## 安全要求

- 不提交 API Key、.env、runtime/、模型缓存、真实病例或 PII；
- 不允许 UI、RAG、Verifier 或生成模型修改 CaseState 与风险裁决；
- 不降低 Semantic Gate 的 ACCEPT 标准来提高表面指标；
- 工具与外部服务失败必须安全降级；
- 新增 Clinical Pathway 必须单独设计正常路径、危险信号、边界与失败测试。

## Pull Request

PR 应说明：

- 解决的问题与改动边界；
- 新增或更新的测试；
- 对 Safety Invariants 的影响；
- 是否修改 API、环境变量或服务端口；
- 若涉及模型评测，数据集是否与开发过程隔离。

安全漏洞不要提交公开 Issue 或 PR，请按 [SECURITY.md](SECURITY.md) 私密报告。
