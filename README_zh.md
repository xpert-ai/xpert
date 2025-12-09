[English](./README.md) | 中文


[uri_license]: https://www.gnu.org/licenses/agpl-3.0.html
[uri_license_image]: https://img.shields.io/badge/License-AGPL%20v3-blue.svg

<p align="center">
  <a href="https://app.mtda.cloud/">XpertAI 云</a> ·
  <a href="https://xpertai.cn/docs/getting-started/community/">自托管</a> ·
  <a href="https://xpertai.cn/docs/">文档</a> ·
  <a href="https://xpertai.cn/#connect">企业咨询</a>
</p>

![visitors](https://visitor-badge.laobi.icu/badge?page_id=meta-d.ocap)
[![License: AGPL v3][uri_license_image]][uri_license]
[![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/xpert-ai/xpert)

**Xpert AI** 是一个开源的企业级 AI 系统，完美融合了智能体编排和数据分析两大平台。

## 💡 新功能

**🚀 3.7 智能体中间件上线！**

XpertAI 3.7 版本正式发布智能体中间件功能，通过模块化插件架构为开发者提供对智能体执行流程的精细化控制与可视化编排能力。该特性兼容LangChain生态，支持灵活组合日志、安全、转换等中间件节点，赋能企业快速构建可观测、可扩展的智能体工作流。

## 智能体与工作流混合架构

在AI技术快速落地的今天，企业面临一个关键矛盾：**如何平衡 LLM 的创造性与流程的稳定性**？纯粹的智能体架构虽灵活，却难以控制；传统工作流虽可靠，却缺乏应变能力。Xpert AI 平台的**智能体与工作流混合架构**，正是为解决这一矛盾而生——它让 AI 既拥有“自由意志”，又遵循“规则秩序”
![agent-workflow-hybrid-architecture](https://github.com/user-attachments/assets/b3b432f9-54ab-4ec1-9fc4-7e46fbfb88ba)

[博客 - 智能体与工作流混合架构](https://xpertai.cn/blog/agent-workflow-hybrid-architecture)

### [智能体编排平台](https://xpertai.cn/docs/ai/)

通过协调多个智能代理的协作，Xpert 能够完成复杂任务。Xpert 通过高效的管理机制集成不同类型的 AI 代理，利用其能力解决多维度问题。

[Xpert智能体](https://github.com/user-attachments/assets/e21f8b35-2f72-4b81-a245-f36759df7c27)

### [数据分析平台](https://xpertai.cn/docs/models/)

基于云计算的敏捷数据分析平台，支持多维建模、指标管理和 BI 展示。平台可连接多种数据源，实现高效灵活的数据分析与可视化，并提供多种智能分析功能和工具，帮助企业快速准确地发现业务价值并制定运营决策。

## 🚀 快速开始

> 在安装 Xpert 之前，请确保您的计算机满足以下最低系统要求：
> 
> - CPU >= 2 核
> - RAM >= 4 GiB
> - Node.js (ESM and CommonJS) - 20.x, 22.x

</br>

启动 Xpert 服务器的最简单方法是通过 [docker compose](docker/docker-compose.yaml)。在使用以下命令运行 Xpert 之前，请确保您的计算机已安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)：

```bash
cd xpert
cd docker
cp .env.example .env
docker compose -f docker-compose.cn.yml up -d
```

运行后，您可以在浏览器中访问 Xpert 仪表盘，地址为 [http://localhost/onboarding](http://localhost/onboarding)，并开始初始化过程。

请查看我们的 [Wiki - 开发](https://github.com/xpert-ai/xpert/wiki/Development) 以快速入门。

## 💻 演示，下载，测试和生产

### 演示

Xpert AI 平台演示地址 <https://app.mtda.cloud> 。

注意:
- 您可以在首页生成样本数据。

### 生产 (SaaS)

Xpert AI 云平台链接为 <https://app.mtda.cloud> 。

注意: 它目前处于 Alpha 版本/测试模式，请谨慎使用！

## 🧱 技术栈

- [TypeScript](https://www.typescriptlang.org) language
- [NodeJs](https://nodejs.org) / [NestJs](https://github.com/nestjs/nest)
- [Nx](https://nx.dev)
- [Angular](https://angular.io)
- [RxJS](http://reactivex.io/rxjs)
- [TypeORM](https://github.com/typeorm/typeorm)
- [Langchain](https://js.langchain.com/)
- [ECharts](https://echarts.apache.org/)
- [Java](https://www.java.com/)
- [Mondrian](https://github.com/pentaho/mondrian)

对于生产环境，我们推荐：

- [PostgreSQL](https://www.postgresql.org)
- [PM2](https://github.com/Unitech/pm2)

## 🗺️ 路线图

- [ ] **SDK** – 简化 XpertAI 平台的 API 访问。
  - [ ] [SDK (TypeScript)](https://github.com/xpert-ai/xpert-sdk-js)
    - [x] 数字专家
    - [x] 长期记忆存储
    - [x] 上下文文件
    - [ ] 知识库
  - [ ] [SDK (Python)](https://github.com/xpert-ai/xpert-sdk-py)

- [x] **插件** – 可扩展的插件系统。
  - [x] 插件系统
  - [x] 展示插件生态的市场
  - [ ] 热插拔插件系统
- [ ] **Chatkit** – 用于嵌入数字专家聊天对话的前端组件库。
- [ ] **小部件** – 让大模型响应驱动更丰富界面体验的 UI 小部件。
- [x] **智能体中间件** – 基于插件的智能体中间件。
- [ ] **智能体技能** – 轻量级智能体技能, 快速集成自定义能力, 提供比 MCP 工具更快捷的替代方案。

## 💌 联系我们

- 商务合作： <mailto:service@xpertai.cn>
- [XpertAI 平台 @ Twitter](https://x.com/xpertai_cloud)
- +微信：xpertai
- [+飞书](https://www.feishu.cn/invitation/page/add_contact/?token=d31n417e-fa7e-4e88-970c-15e502b6de0a)

## 🛡️ 许可证

我们支持开源社区。

此软件在以下许可下可用：

- [Xpert AI 平台社区版](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-community-edition-license)
- [Xpert AI 平台企业版](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-small-business-license)
- [Xpert AI 平台企业专业版](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-enterprise-license)

#### 请参阅 [LICENSE](LICENSES.md) 以获取有关许可的更多信息。

## 💪 感谢我们的贡献者

**贡献者**

<a href="https://github.com/xpert-ai/xpert/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=xpert-ai/xpert" />
</a>

- 请给我们在 Github 上点个 :star: , 这真的很有**帮助**!
- 非常欢迎您在 [Xpert repo](https://github.com/xpert-ai/xpert/issues) 中提交功能请求。
- Pull requests 总是欢迎的！请将拉取请求基于 _develop_ 分支，并遵循 [贡献指南](.github/CONTRIBUTING.md)。
