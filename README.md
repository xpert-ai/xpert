English | [中文](./README_zh.md)

[uri_license]: https://www.gnu.org/licenses/agpl-3.0.html
[uri_license_image]: https://img.shields.io/badge/License-AGPL%20v3-blue.svg

<p align="center">
  <a href="https://mtda.cloud/en/">
    <img src="docs/images/logo.png" alt="Xpert AI" style="width: 240px; height: auto;">
  </a>
</p>

<p align="center">
  <a href="https://app.mtda.cloud/">XpertAI Cloud</a> ·
  <a href="https://mtda.cloud/en/docs/getting-started/community/">Self-hosting</a> ·
  <a href="https://mtda.cloud/en/docs/">Documentation</a> ·
  <a href="https://mtda.cloud/en/#connect">Enterprise inquiry</a>
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

**🚀 XpertAI 3.6 is here!**

This release introduces a complete **Knowledge Pipeline** system — from creation, orchestration, authorization, and publishing to continuous knowledgebase management — enabling teams to visually build reliable knowledge production workflows.
The **plugin system** is now a native part of the pipeline, allowing seamless integration with external data sources, document processors, and OCR tools through system integrations or the plugin marketplace.
With the new **Parent-Child Chunk Tree** structure and **Trigger Nodes**, XpertAI 3.6 delivers smarter document understanding and contextual retrieval. Secure data access via **environment variables or unified integrations**, and publish pipelines directly into the **Digital Expert Ecosystem** for automated, scalable knowledge operations.
<img width="2888" height="1622" alt="basic-pipeline-workflow" src="https://github.com/user-attachments/assets/4a8ea345-47cf-4fcf-a477-4a09b55ec4e0" />
<img width="3836" height="1924" alt="plugins" src="https://github.com/user-attachments/assets/218edc31-f0e3-4603-9140-4ebc8b5fdf87" />


## Agent-Workflow Hybrid Architecture

In today’s rapidly evolving AI landscape, enterprises face a key challenge: **How to balance the creativity of LLMs with the stability of workflows**? Pure agent architectures are flexible but hard to control; traditional workflows are reliable but lack adaptability. Xpert AI’s **Agent-Workflow Hybrid Architecture** is designed to resolve this conflict, enabling AI to have “free will” while adhering to “rule-based order.”
![agent-workflow-hybrid-architecture](https://github.com/user-attachments/assets/b3b432f9-54ab-4ec1-9fc4-7e46fbfb88ba)

[Blog - Agent-Workflow Hybrid Architecture](https://mtda.cloud/en/blog/agent-workflow-hybrid-architecture)

### [Agent Orchestration Platform](https://mtda.cloud/en/docs/ai/)

By coordinating the collaboration of multiple intelligent agents, Xpert can handle complex tasks. Xpert integrates different types of AI agents through efficient management mechanisms, leveraging their capabilities to address multidimensional problems.

[Xpert Agent](https://github.com/user-attachments/assets/e21f8b35-2f72-4b81-a245-f36759df7c27)

### [Data Analysis Platform](https://mtda.cloud/en/docs/models/)

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

- [ ] **Plugins** – extensible plugin system.
  - [x] Plugins system
  - [ ] Marketplace to showcase the plugins ecosystem.
- [ ] **Chatkit** – front-end component library for embedding digital expert chat dialog.
- [ ] **Widgets** – UI widgets that let large-model responses drive richer interface experiences.
- [ ] **Agent Skills** – lightweight agent skills for rapid custom capability integration, offering a quicker alternative to MCP tools.

## 💌 Contact Us

- For business inquiries: <mailto:service@mtda.cloud>
- [Xpert AI Platform @ Twitter](https://x.com/xpertai_cloud)

## 🛡️ License

We support the open-source community.

This software is available under the following licenses:

- [Xpert AI Platform Community Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-community-edition-license)
- [Xpert AI Platform Enterprise Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-small-business-license)
- [Xpert AI Platform Enterprise Pro Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-enterprise-license)

#### Please see [LICENSE](LICENSES.md) for more information on licenses.

## 💪 Thanks to our Contributors

**Contributors**

<a href="https://github.com/xpert-ai/xpert/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=xpert-ai/xpert" />
</a>

- Please give us :star: on Github, it **helps**!
- You are more than welcome to submit feature requests in the [Xpert AI repo](https://github.com/xpert-ai/xpert/issues)
- Pull requests are always welcome! Please base pull requests against the _develop_ branch and follow the [contributing guide](.github/CONTRIBUTING.md).
