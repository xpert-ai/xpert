[English](./README.md) | 中文

[uri_license]: https://www.gnu.org/licenses/agpl-3.0.html
[uri_license_image]: https://img.shields.io/badge/License-AGPL%20v3-blue.svg

<p align="center">
  <a href="https://xpertai.cn/">
    <img src="docs/images/logo.png" alt="Xpert AI" style="width: 240px; height: auto;">
  </a>
</p>

<p align="center">
  <a href="https://app.xpertai.cn/">XpertAI 云</a> ·
  <a href="https://docs.xpertai.cn/zh-Hans/ai/getting-started/community">自托管</a> ·
  <a href="https://docs.xpertai.cn/zh-Hans/">文档</a> ·
  <a href="https://xpertai.cn/#connect">企业咨询</a>
</p>

<p align="center">
  <em>面向企业的开源智能体平台，覆盖多智能体编排、Agentic BI、可治理数据执行和插件化智能体应用。</em>
</p>

<p align="center">
  <a href="https://github.com/xpert-ai/xpert/" target="_blank">
    <img src="https://visitor-badge.laobi.icu/badge?page_id=meta-d.ocap" alt="Visitors">
  </a>
  <a href="https://www.npmjs.com/@xpert-ai/contracts" target="_blank">
    <img src="https://img.shields.io/npm/v/@xpert-ai/contracts.svg?logo=npm&logoColor=fff&label=NPM+package&color=limegreen" alt="contracts on npm" />
  </a>&nbsp;
  <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank">
    <img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL v3">
  </a>
  <a href="https://gitpod.io/#https://github.com/xpert-ai/xpert" target="_blank">
    <img src="https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod" alt="Gitpod Ready-to-Code">
  </a>
</p>

**Xpert AI** 是一个用于构建企业级 AI 系统的开源平台。它把数字专家、多智能体协作、工作流编排、知识检索、工具执行、Agentic BI、Data Xpert / UOSE 可治理数据访问、插件化智能体应用，以及可嵌入的 ChatKit 对话体验整合到同一套平台中。

Xpert 不鼓励让模型直接面对裸数据库、API、文件和看板，而是把企业资源转化为可治理工具、语义对象、可复核工作台视图和可审计执行流程。团队可以在需要灵活推理的地方使用 Agent，在需要稳定流程的地方使用 Workflow，并在关键业务决策处保留人工复核。

## 最新能力概览

近期 Xpert 3.x 的重点，是把平台升级为更完整的企业智能体运行层：

- **Agentic Apps**：插件可以贡献 Assistant 模板、Agent 中间件工具、Workbench 视图、Remote Component、目标应用元数据和业务数据模型。
- **文件理解**：上传文件可以被解析为可搜索资产，包含 chunks、page images、citation anchors、artifacts 和 workspace paths，供 Agent 按需引用。
- **工作台驱动执行**：Assistant 工具调用可以打开或刷新插件工作台视图，让用户检查、修正、审批或提交结果。
- **插件与 MCP 扩展**：插件可以交付系统集成、模型供应商、中间件、Skills、MCP tools、MCP Apps 和受管运行时资源。
- **运行观测**：Copilot 与 Agent 执行持续增强用户级使用统计、任务状态、Prometheus 指标、conversation goals 和保留清理能力。

## 核心能力

### Agent Platform

Xpert 提供可视化平台，用于创建能够协调多个专业 Agent、工具、工作流和知识库的**数字专家**。

- 构建 Supervisor、层级型、Swarm 或自定义多智能体系统。
- 在同一个过程中组合自主 Agent 节点和确定性 Workflow 节点。
- 为不同 Agent 节点挂载工具集、知识库、Skills 和 Agent Middleware。
- 通过中间件转换提示词、控制工具选择、加入重试/降级逻辑、执行防护栏，或暴露业务工具。
- 跟踪会话、工具调用、中间步骤、上下文使用量、任务状态和执行事件。

### Agentic BI

Xpert 内置智能体驱动的 BI 能力，用于语义建模、指标管理和自然语言业务分析。

- 管理语义模型、Cube、维度、度量、公式和业务域。
- 定义和运营业务指标，支持口径、公式、层级、来源追溯和复用逻辑。
- 让 Agent 使用语义模型、指标管理和 ChatBI 工具集完成建模、查询、解释和追问分析。
- 支持多轮分析对话，Assistant 可以规划、查询、细化、解释并建议下一步动作。

### Data Xpert / UOSE

Data Xpert 本体系统，也可称为 **UOSE**（Unified Object-Semantic Execution），会把企业资源转化为面向 Agent 的可治理对象语义执行空间。

- 接入语义模型、SAP OData、知识图谱、数据库和业务 API 等外部资源。
- 将元数据归一化为 ontology snapshot、实体图谱、关系、属性、动作和证据。
- 让 Agent 通过稳定工具发现对象和动作，而不是猜 SQL 或后端接口。
- 执行动作前先模拟，应用策略，对高风险操作要求审批，并记录审计轨迹。
- 通过 Data Xpert 工作台完成资源接入、本体浏览、策略管理、审批队列、执行审计和资源对话。

### Agentic Apps 与插件

Xpert 插件系统让团队可以把业务能力交付为可安装、可配置、可复核的应用，而不是一次性的提示词。

- 用插件元数据、配置 schema、生命周期、服务端模块、实体、服务和策略提供器封装能力。
- 通过 `targetApps` 与 `targetAppMeta` 声明 Workbench 视图、Assistant 工具、业务应用、模板、MCP server 和资源等插件界面。
- 为需要人工复核、上传、修正、审批和运营的流程提供 Workbench 视图或 React iframe Remote Component。
- 用结构化 schema 和明确调用顺序暴露窄而稳定的 Agent 中间件工具。
- 贡献 Assistant 模板，让用户一步创建包含提示词、工具、插件和起始任务的业务助手。
- 通过官方与社区插件仓库扩展平台生态。

### 文件与知识理解

Xpert 让 Agent 能在受控边界内使用文档、文件和企业知识。

- 维护知识库，支持文档解析、chunking、embedding、检索测试和动态更新。
- 使用 File Understanding 将上传文件表示为 `FileAsset`、artifacts、chunks、page images、citation anchors 和 workspace file paths。
- 将知识检索、GraphRAG 风格实体证据和文件感知工具组合起来，支撑重文档业务流程。
- 用 workspace files 和知识资源作为可审计上下文，避免把大量非结构化内容直接塞进提示词。

### ChatKit 与嵌入式对话

ChatKit 是面向 Xpert 助手的可嵌入对话框架。

- 提供 React、Vue、Vue 2、Angular、SAP UI5、Web Component 和 vanilla JavaScript 包。
- 支持流式回复、工具调用可视化、文件上传、线程、i18n、主题和宿主自动化。
- 将 Xpert Agent 嵌入产品界面，同时把后端工作流、工具和治理逻辑保留在 Xpert 平台中。
- 在适合的场景中，通过 widgets、MCP Apps 和工作台可视化呈现更丰富的工具结果。

## 架构

Xpert 采用**智能体与工作流混合架构**：Agent 负责灵活推理和工具选择，Workflow 负责稳定、可检查的控制路径。这让团队可以同时获得自然语言问题求解能力，以及企业场景需要的可重复、可复核和可治理执行。

![agent-workflow-hybrid-architecture](https://github.com/user-attachments/assets/b3b432f9-54ab-4ec1-9fc4-7e46fbfb88ba)

[博客 - 智能体与工作流混合架构](https://xpertai.cn/blog/agent-workflow-hybrid-architecture)

## 仓库导览

当前仓库是一个 Nx monorepo。关键目录包括：

| 路径                                               | 用途                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/api`                                         | 主 NestJS API 应用和平台启动入口。                                                |
| `apps/cloud`                                       | Angular Web 应用，包含 Xpert Cloud UI、Agent Studio、工作空间、设置和工作台界面。 |
| `packages/server-ai`                               | Agent 执行、聊天、模型供应商、工具集、MCP、知识、handoff 和 AI runtime 服务。     |
| `packages/server`                                  | 平台共享的核心服务端模块。                                                        |
| `packages/contracts`                               | 前端、后端、SDK 和插件共享的 TypeScript 契约。                                    |
| `packages/plugin-sdk`                              | 用于开发 Xpert 插件、View Extension、配置表单、权限和 Remote Component 的 SDK。   |
| `packages/plugins`                                 | 随宿主交付的内置插件包。                                                          |
| `packages/core`, `packages/angular`, `packages/ui` | 核心数据/分析库和可复用 UI 包。                                                   |
| `docker`                                           | Docker Compose 部署文件和环境变量模板。                                           |

相关仓库：

| 仓库                                                         | 内容                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [`xpert-plugins`](https://github.com/xpert-ai/xpert-plugins) | 官方与社区插件，包括集成、模型、中间件、工具、Skills 和 Agentic Apps。                  |
| [`chatkit-js`](https://github.com/xpert-ai/chatkit-js)       | 面向 React、Vue、Angular、UI5、Web Component、浏览器扩展、widgets 和示例的 ChatKit 包。 |
| [`xpert-sdk-js`](https://github.com/xpert-ai/xpert-sdk-js)   | 用于调用 Xpert API 的 TypeScript SDK 包和示例。                                         |
| [`xpert-skills`](https://github.com/xpert-ai/xpert-skills)   | 公共 Skill 示例、模板和 Agent Skills 规范。                                             |
| [`docs`](https://github.com/xpert-ai/docs)                   | 产品、AI、插件、数据、BI 和教程文档。                                                   |

## 快速开始

> 在安装 Xpert 之前，请确保您的计算机满足以下最低系统要求：
>
> - CPU >= 2 核
> - RAM >= 4 GiB
> - Node.js (ESM and CommonJS) - 20.x, 22.x

启动 Xpert 服务器的最简单方法是通过 [docker compose](docker/docker-compose.yml)。在使用以下命令运行 Xpert 之前，请确保您的计算机已安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)：

```bash
cd xpert
cd docker
cp env.example .env
docker compose -f docker-compose.cn.yml up -d
```

运行后，您可以在浏览器中访问 Xpert 仪表盘，地址为 [http://localhost/onboarding](http://localhost/onboarding)，并开始初始化过程。

有关安装与启动说明，请参阅[官方文档](https://docs.xpertai.cn/zh-Hans/ai/getting-started/community)。

更多信息请访问 [Xpert AI 官方网站](https://xpertai.cn/)。

请查看我们的 [Wiki - 开发](https://github.com/xpert-ai/xpert/wiki/Development) 以快速入门。

## 演示、云服务与生产

### 演示

Xpert AI 平台演示地址：<https://app.xpertai.cn>。

注意：

- 您可以在首页生成样本数据。

### 生产 (SaaS)

Xpert AI 云平台链接为 <https://app.xpertai.cn>。

注意：它目前处于 Alpha / 测试模式，请谨慎使用。

## 技术栈

- [TypeScript](https://www.typescriptlang.org)
- [Node.js](https://nodejs.org) / [NestJS](https://github.com/nestjs/nest)
- [Nx](https://nx.dev)
- [Angular](https://angular.dev)
- [RxJS](http://reactivex.io/rxjs)
- [TypeORM](https://github.com/typeorm/typeorm)
- [LangChain](https://js.langchain.com/)
- [ECharts](https://echarts.apache.org/)
- [Java](https://www.java.com/)
- [Mondrian](https://github.com/pentaho/mondrian)

对于生产环境，我们推荐：

- [PostgreSQL](https://www.postgresql.org)
- [PM2](https://github.com/Unitech/pm2)

## 生态与状态

| 方向                | 状态                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Agent 编排与工作流  | 核心平台能力，包含多智能体系统、工作流节点、工具集、知识库和中间件。                               |
| Agentic BI          | 活跃产品能力，覆盖语义模型、指标、ChatBI 和自然语言分析。                                          |
| Data Xpert / UOSE   | 活跃数据与本体能力，支持可治理资源发现、动作执行、审批和审计。                                     |
| 插件与 Agentic Apps | 活跃生态，包含插件市场、SDK、Workbench 视图、Remote Component、中间件工具、MCP tools 和 MCP Apps。 |
| ChatKit             | 已提供多框架嵌入式对话框架，支持流式回复、工具、上传、线程、widgets 和 i18n。                      |
| Skills              | 已提供可复用指令/资源包，可安装到工作区并由 Agent 加载。                                           |
| SDK                 | TypeScript SDK 可用；Python SDK 规划中。                                                           |
| 观测与运维          | 持续建设使用统计、Prometheus 指标、conversation goals、runtime operations、trace 和 evaluation。   |

## 路线图

近期开发会聚焦在几个平台级方向：

- [ ] **项目工作空间**：AI 辅助规划、文件、团队、看板式任务执行，以及项目范围内的多智能体协作。
- [ ] **治理与合规**：增强审计日志、角色权限控制、审批流程、策略覆盖和企业部署控制能力。
- [ ] **Trace 与 Evaluation**：为 Agent 运行、工作流路径、工具调用、上下文使用量和评估反馈提供更深入的可观测能力。
- [x] **插件与 Agentic App 生态**：完善市场元数据、本地开发体验、官方业务应用，以及更安全的插件托管 MCP runtime。
- [x] **SDK 与嵌入能力**：扩展 SDK 覆盖范围，持续改进 ChatKit，并降低企业已有产品的集成成本。
- [ ] **运维与可靠性**：完善监控、告警、保留策略、runtime 控制和自托管生产部署稳定性。

## 联系我们

- 商务合作：<mailto:service@xpertai.cn>
- [XpertAI 平台 @ Twitter](https://x.com/xpertai_cloud)
- 微信：xpertai
- [飞书](https://www.feishu.cn/invitation/page/add_contact/?token=d31n417e-fa7e-4e88-970c-15e502b6de0a)

## 许可证

我们支持开源社区。

此软件在以下许可下可用：

- [Xpert AI 平台社区版](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-community-edition-license)
- [Xpert AI 平台企业版](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-small-business-license)
- [Xpert AI 平台企业专业版](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-enterprise-license)

请参阅 [LICENSE](LICENSES.md) 以获取有关许可的更多信息。

## 感谢我们的贡献者

**贡献者**

<a href="https://github.com/xpert-ai/xpert/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=xpert-ai/xpert" />
</a>

- 请给我们在 GitHub 上点个 star，这真的很有帮助。
- 非常欢迎您在 [Xpert AI repo](https://github.com/xpert-ai/xpert/issues) 中提交功能请求。
- Pull requests 总是欢迎的！请将拉取请求基于 _develop_ 分支，并遵循 [贡献指南](.github/CONTRIBUTING.md)。
