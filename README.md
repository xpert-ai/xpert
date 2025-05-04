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

### 🔧 Digital Expert Project - New Collaboration Features Launched!

We’ve introduced the **Xpert Project** module, offering users a flexible space for agent collaboration, enabling multiple digital experts to work together to achieve project goals:

- 🧠 Combine multiple digital experts in a single project to collaboratively solve complex problems
- 🧰 Integrate custom toolsets (e.g., MCP tools) to empower project agents
- 📎 Upload files as shared context to help agents understand more project details
- 🔄 Support exploration mode (AI autonomous exploration) and planning mode (step-by-step execution)
- 👥 Invite team members to join projects, supporting multi-user collaboration
- 📁 Manage project sessions with unified system instructions for improved consistency

📌 Get Started: Enter any digital expert chat interface → Click “Create Project” → Unlock a new multi-agent collaboration experience!

👉 Learn More: [Xpert Project Feature Guide](https://mtda.cloud/en/docs/ai/chat/project/)

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
> - Node.js (ESM and CommonJS) - 18.x, 19.x, 20.x, 22.x

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
- [Xpert AI Platform Enterprise Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-small-business-license)
- [Xpert AI Platform Enterprise Pro Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSE.md#xpert-ai-platform-enterprise-license)

#### Please see [LICENSE](LICENSE.md) for more information on licenses.

## 💪 Thanks to our Contributors

**Contributors**

<a href="https://github.com/xpert-ai/xpert/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=xpert-ai/xpert" />
</a>

- Please give us :star: on Github, it **helps**!
- You are more than welcome to submit feature requests in the [Xpert AI repo](https://github.com/xpert-ai/xpert/issues)
- Pull requests are always welcome! Please base pull requests against the _develop_ branch and follow the [contributing guide](.github/CONTRIBUTING.md).
