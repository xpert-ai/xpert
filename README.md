English | [中文](./README_zh.md)

[uri_license]: https://www.gnu.org/licenses/agpl-3.0.html
[uri_license_image]: https://img.shields.io/badge/License-AGPL%20v3-blue.svg

<p align="center">
  <a href="https://mtda.cloud/en/">
  <img src="https://avatars.githubusercontent.com/u/100019674?v=4" alt="Xpert AI">
  </a>
</p>

<p align="center">
  <a href="https://app.mtda.cloud/">Xpert Cloud</a> ·
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

**Agent and Workflow Hybrid Architecture**

In today's rapidly evolving AI landscape, enterprises face a critical dilemma: **how to balance the creativity of LLMs with the stability of processes?** While purely agent-based architectures offer flexibility, they are difficult to control; traditional workflows, though reliable, lack adaptability. The **Agent and Workflow Hybrid Architecture** of the Xpert AI platform is designed to resolve this conflict — it allows AI to possess "free will" while adhering to "rules and order."
![agent-workflow-hybrid-architecture](https://github.com/user-attachments/assets/b3b432f9-54ab-4ec1-9fc4-7e46fbfb88ba)

[Blog - Agent and Workflow Hybrid Architecture](https://mtda.cloud/en/blog/agent-workflow-hybrid-architecture)

## [Agent Orchestration Platform](https://mtda.cloud/en/docs/ai/)

By coordinating the collaboration of multiple agents, Xpert completes complex tasks. Xpert integrates different types of AI agents through an efficient management mechanism, utilizing their capabilities to solve multidimensional problems.

[Xpert Agents](https://github.com/user-attachments/assets/e21f8b35-2f72-4b81-a245-f36759df7c27)

## [Data Analysis Platform](https://mtda.cloud/en/docs/models/)

An agile data analysis platform based on cloud computing for multidimensional modeling, indicator management, and BI display. It supports connecting to various data sources, achieving efficient and flexible data analysis and visualization, and provides multiple intelligent analysis functions and tools to help enterprises quickly and accurately discover business value and make operational decisions.

### ChatBI

[ChatBI](https://mtda.cloud/en/docs/chatbi) is an innovative feature we are introducing, combining chat functionality with business intelligence (BI) analysis capabilities. It offers users a more intuitive and convenient data analysis experience through natural language interaction.

[ChatBI_Demo.mp4](https://github.com/user-attachments/assets/5f7c84be-2307-43cf-8342-bce39524e37d)

## 🚀 Quick Start

> Before installing Xpert, make sure your machine meets the following minimum system requirements:
> 
>- CPU >= 2 Core
>- RAM >= 4 GiB

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

## 🎯 Mission

__Empowering enterprises with intelligent collaboration and data-driven insights through innovative AI orchestration and agile analytics.__

## 🌼 Screenshots

<details>
<summary>Show / Hide Screenshots</summary>

### Pareto analysis [open in new tab](https://app.mtda.cloud/public/story/892690e5-66ab-4649-9bf5-c1a9c432c01b?pageKey=bsZ0sjxnxI)
![Pareto analysis Screenshot](https://github.com/meta-d/meta-d/raw/main/img/v2.0/story-workspace.png)

### Product profit analysis [open in new tab](https://app.mtda.cloud/public/story/892690e5-66ab-4649-9bf5-c1a9c432c01b?pageKey=6S4oEUnVO3)
![Product profit analysis Screenshot](https://github.com/meta-d/meta-d/raw/main/img/v2.0/story-viewer.png)

### Reseller analysis [open in new tab](https://app.mtda.cloud/public/story/a58112aa-fc9c-4b5b-a04e-4ea9b57ebba9?pageKey=nrEZxh1aqp)
![Reseller analysis Screenshot](https://github.com/meta-d/meta-d/raw/main/img/reseller-profit-analysis.png)

### Bigview dashboard [open in new tab](https://app.mtda.cloud/public/story/9c462bea-89f6-44b8-a35e-34b21cd15a36)
![Bigview dashboard Screenshot](https://github.com/meta-d/meta-d/raw/main/img/bigview-supermart-sales.png)

### Indicator application [open in new tab](https://www.mtda.cloud/en/blog/2023/07/24/sample-adv-7-indicator-app)
![Indicator application Screenshot](https://github.com/meta-d/meta-d/raw/main/img/v2.0/indicator-app-ai-copilot.png)

### Indicator mobile app [open in new tab](https://www.mtda.cloud/en/blog/2023/07/24/sample-adv-7-indicator-app)
![Indicator mobile app Screenshot](https://github.com/meta-d/meta-d/raw/main/img/indicator-app-mobile.jpg)

</details>

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

#### See also README.md and CREDITS.md files in relevant folders for lists of libraries and software included in the Platform, information about licenses, and other details

## 📄 Documentation

Please refer to our official [Platform Documentation](https://mtda.cloud/en/docs/) and to our [Wiki](https://github.com/xpert-ai/xpert/wiki) (WIP).

## 💌 Contact Us

- For business inquiries: <mailto:service@mtda.cloud>
- [Xpert AI Platform @ Twitter](https://twitter.com/CloudMtda)

## 🛡️ License

We support the open-source community.

This software is available under the following licenses:

- [Xpert AI Platform Community Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-community-edition-license)
- [Xpert AI Platform Small Business](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-small-business-license)
- [Xpert AI Platform Enterprise](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-enterprise-license)

#### Please see [LICENSE](LICENSE.md) for more information on licenses.

## 💪 Thanks to our Contributors

**Contributors**

<a href="https://github.com/xpert-ai/xpert/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=xpert-ai/xpert" />
</a>

- Please give us :star: on Github, it **helps**!
- You are more than welcome to submit feature requests in the [Xpert AI repo](https://github.com/xpert-ai/xpert/issues)
- Pull requests are always welcome! Please base pull requests against the _develop_ branch and follow the [contributing guide](.github/CONTRIBUTING.md).
