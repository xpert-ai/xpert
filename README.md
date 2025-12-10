English | [中文](./README_zh.md)

[uri_license]: https://www.gnu.org/licenses/agpl-3.0.html
[uri_license_image]: https://img.shields.io/badge/License-AGPL%20v3-blue.svg

<p align="center">
  <a href="https://xpertai.cn/en/">
    <img src="docs/images/logo.png" alt="Xpert AI" style="width: 240px; height: auto;">
  </a>
</p>

<p align="center">
  <a href="https://app.mtda.cloud/">XpertAI Cloud</a> ·
  <a href="https://xpertai.cn/en/docs/getting-started/community/">Self-hosting</a> ·
  <a href="https://xpertai.cn/en/docs/">Documentation</a> ·
  <a href="https://xpertai.cn/en/#connect">Enterprise inquiry</a>
</p>

<p align="center">
  <em>Open-Source AI Platform for Enterprise Data Analysis, Indicator Management and Agents Orchestration</em>
</p>
<p align="center">
  <a href="https://github.com/xpert-ai/xpert/" target="_blank">
    <img src="https://visitor-badge.laobi.icu/badge?page_id=meta-d.ocap" alt="Visitors">
  </a>
  <a href="https://www.npmjs.com/@metad/ocap-core">
    <img src="https://img.shields.io/npm/v/@metad/ocap-core.svg?logo=npm&logoColor=fff&label=NPM+package&color=limegreen" alt="ocap on npm" />
  </a>&nbsp;
  <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank">
    <img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL v3">
  </a>
  <a href="https://gitpod.io/#https://github.com/xpert-ai/xpert" target="_blank">
    <img src="https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod" alt="Gitpod Ready-to-Code">
  </a>
</p>

**Xpert AI** is an open-source enterprise-level AI system that perfectly integrates two major platforms: agent orchestration and data analysis.

## 💡 What's New

**🚀 3.7 Agent Middleware Released!**

XpertAI 3.7 officially launches the Agent Middleware feature, providing developers with fine-grained control and visual orchestration capabilities over agent execution flows through a modular plugin architecture. This feature is compatible with the LangChain ecosystem, supports flexible composition of middleware nodes such as logging, security, and transformation, empowering enterprises to rapidly build observable and extensible agent workflows.

## Agent-Workflow Hybrid Architecture

In today’s rapidly evolving AI landscape, enterprises face a key challenge: **How to balance the creativity of LLMs with the stability of workflows**? Pure agent architectures are flexible but hard to control; traditional workflows are reliable but lack adaptability. Xpert AI’s **Agent-Workflow Hybrid Architecture** is designed to resolve this conflict, enabling AI to have “free will” while adhering to “rule-based order.”
![agent-workflow-hybrid-architecture](https://github.com/user-attachments/assets/b3b432f9-54ab-4ec1-9fc4-7e46fbfb88ba)

[Blog - Agent-Workflow Hybrid Architecture](https://xpertai.cn/en/blog/agent-workflow-hybrid-architecture)

### [Agent Orchestration Platform](https://xpertai.cn/en/docs/ai/)

By coordinating the collaboration of multiple intelligent agents, Xpert can handle complex tasks. Xpert integrates different types of AI agents through efficient management mechanisms, leveraging their capabilities to address multidimensional problems.

[Xpert Agent](https://github.com/user-attachments/assets/e21f8b35-2f72-4b81-a245-f36759df7c27)

### [Data Analysis Platform](https://xpertai.cn/en/docs/models/)

A cloud-based agile data analysis platform supporting multidimensional modeling, metrics management, and BI visualization. The platform connects to various data sources, enabling efficient and flexible data analysis and visualization, and offers multiple intelligent analysis tools to help enterprises quickly and accurately uncover business value and make operational decisions.

## 🚀 Quick Start

> Before installing Xpert, make sure your machine meets the following minimum system requirements:
>
> - CPU >= 2 Core
> - RAM >= 4 GiB
> - Node.js (ESM and CommonJS) - 20.x, 22.x

</br>

The easiest way to start the Xpert server is through [docker compose](docker/docker-compose.yaml). Before running Xpert with the following commands, make sure that [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) are installed on your machine:

```bash
cd xpert
cd docker
cp .env.example .env
docker compose up -d
```

After running, you can access the Xpert dashboard in your browser at [http://localhost/onboarding](http://localhost/onboarding) and start the initialization process.

Please check our [Wiki - Development](https://github.com/xpert-ai/xpert/wiki/Development) to get started quickly.

## 💻 Demo, Downloads, Testing and Production

### Demo

Xpert AI Platform Demo at <https://app.mtda.cloud>.

Notes:

- You can generate samples data in the home dashbaord page.

### Production (SaaS)

Xpert AI Platform SaaS is available at <https://app.mtda.cloud>.

Note: it's currently in Alpha version / in testing mode, please use it with caution!

## 🧱 Technology Stack and Requirements

- [TypeScript](https://www.typescriptlang.org) language
- [NodeJs](https://nodejs.org) / [NestJs](https://github.com/nestjs/nest)
- [Nx](https://nx.dev)
- [Angular](https://angular.dev)
- [RxJS](http://reactivex.io/rxjs)
- [TypeORM](https://github.com/typeorm/typeorm)
- [Langchain](https://js.langchain.com/)
- [ECharts](https://echarts.apache.org/)
- [Java](https://www.java.com/)
- [Mondrian](https://github.com/pentaho/mondrian)

For Production, we recommend:

- [PostgreSQL](https://www.postgresql.org)
- [PM2](https://github.com/Unitech/pm2)

## 🗺️ Roadmap

- [ ] **SDK** – streamlines access api of the XpertAI platform.
  - [ ] [SDK (TypeScript)](https://github.com/xpert-ai/xpert-sdk-js)
    - [x] digital experts
    - [x] long-term memory storage
    - [x] contextual files
    - [ ] knowledge bases
  - [ ] [SDK (Python)](https://github.com/xpert-ai/xpert-sdk-py)

- [x] **Plugins** – extensible plugin system.
  - [x] Plugins system
  - [x] Marketplace to showcase the plugins ecosystem.
  - [ ] Hot-swappable plugin system.
- [ ] **Chatkit** – front-end component library for embedding digital expert chat dialog.
- [ ] **Widgets** – UI widgets that let large-model responses drive richer interface experiences.
- [x] **Agent Middlewares** Plugin-based Agent Middleware.
- [ ] **Agent Skills** – lightweight agent skills for rapid custom capability integration, offering a quicker alternative to MCP tools.

## 💌 Contact Us

- For business inquiries: <mailto:service@xpertai.cn>
- [Xpert AI Platform @ Twitter](https://x.com/xpertai_cloud)

## 🛡️ License

We support the open-source community.

This software is available under the following licenses:

- [Xpert AI Platform Community Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-community-edition-license)
- [Xpert AI Platform Enterprise Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-small-business-license)
- [Xpert AI Platform Enterprise Pro Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-enterprise-license)

#### Please see [LICENSE](LICENSES.md) for more information on licenses.

## 💪 Thanks to our Contributors

**Contributors**

<a href="https://github.com/xpert-ai/xpert/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=xpert-ai/xpert" />
</a>

- Please give us :star: on Github, it **helps**!
- You are more than welcome to submit feature requests in the [Xpert AI repo](https://github.com/xpert-ai/xpert/issues)
- Pull requests are always welcome! Please base pull requests against the _develop_ branch and follow the [contributing guide](.github/CONTRIBUTING.md).
