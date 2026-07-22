English | [中文](./README_zh.md)

[uri_license]: https://www.gnu.org/licenses/agpl-3.0.html
[uri_license_image]: https://img.shields.io/badge/License-AGPL%20v3-blue.svg

<p align="center">
  <a href="https://xpertai.cn/en/">
    <img src="docs/images/logo.png" alt="Xpert AI" style="width: 240px; height: auto;">
  </a>
</p>

<p align="center">
  <a href="https://app.xpertai.cn/">XpertAI Cloud</a> ·
  <a href="https://docs.xpertai.cn/en/ai/getting-started/community">Self-hosting</a> ·
  <a href="https://docs.xpertai.cn/en/">Documentation</a> ·
  <a href="https://xpertai.cn/en/#connect">Enterprise inquiry</a>
</p>

<p align="center">
  <em>Open-source enterprise Agent platform for multi-agent orchestration, Agentic BI, governed data execution, and plugin-based Agentic Apps.</em>
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

**Xpert AI** is an open-source platform for building enterprise-grade AI systems. It brings together digital experts, multi-agent collaboration, workflow orchestration, knowledge retrieval, tool execution, Agentic BI, Data Xpert/UOSE governed data access, plugin-delivered Agentic Apps, and embeddable ChatKit experiences in one stack.

Instead of exposing raw databases, APIs, files, and dashboards directly to models, Xpert turns enterprise resources into governed tools, semantic objects, reviewable workbench views, and auditable execution flows. Teams can build assistants that reason freely where useful, follow deterministic workflows where required, and keep humans in the loop for business-critical decisions.

## Latest Capability Highlights

Recent Xpert 3.x work has focused on making the platform a fuller enterprise Agent operating layer:

- **Agentic Apps**: plugins can contribute Assistant templates, Agent middleware tools, Workbench views, Remote Components, target app metadata, and business data models.
- **File Understanding**: uploaded files can become searchable assets with chunks, page images, citation anchors, artifacts, and workspace paths that agents can reference.
- **Workbench-driven execution**: Assistant tool calls can open or refresh plugin-owned workbench views so users can inspect, correct, approve, or submit results.
- **Plugin and MCP extensibility**: plugins can deliver system integrations, model providers, middleware, Skills, MCP tools, MCP Apps, and managed runtime resources.
- **Operational visibility**: Copilot and Agent execution continue to gain usage summaries, task status updates, Prometheus metrics, conversation goals, and retention cleanup.

## Core Capabilities

### Agent Platform

Xpert provides a visual platform for creating **digital experts** that can coordinate multiple specialized agents, tools, workflows, and knowledge bases.

- Build supervisor, hierarchical, swarm, or custom multi-agent systems.
- Combine autonomous Agent nodes with deterministic Workflow nodes in the same process.
- Attach toolsets, knowledge bases, Skills, and Agent Middleware to each agent node.
- Use middleware to transform prompts, control tool selection, add retry/fallback logic, enforce guardrails, or expose business tools.
- Track conversations, tool calls, intermediate steps, context usage, task status, and execution events.

### Agentic BI

Xpert includes an agent-driven BI layer for semantic modeling, metrics, and natural-language business analysis.

- Manage semantic models, cubes, dimensions, measures, formulas, and business domains.
- Define and operate business indicators with lineage, formulas, hierarchy, and reusable metric logic.
- Let agents use semantic model, indicator management, and ChatBI toolsets for modeling, querying, explanation, and follow-up analysis.
- Support multi-turn analytical conversations where the assistant can plan, query, refine, explain, and suggest next steps.

### Data Xpert / UOSE

The Data Xpert ontology system, also described as **UOSE** (Unified Object-Semantic Execution), turns enterprise resources into a governed object-semantic execution space for agents.

- Register external resources such as semantic models, SAP OData services, knowledge graphs, databases, and business APIs.
- Normalize metadata into ontology snapshots, entity graphs, relationships, properties, actions, and evidence.
- Let agents discover objects and actions through stable tools instead of guessing SQL or backend APIs.
- Simulate actions before execution, apply policies, require approvals for high-risk operations, and record audit traces.
- Use Data Xpert workbench pages for resource access, ontology browsing, policy management, approval queues, execution audit, and resource chat.

### Agentic Apps & Plugins

Xpert's plugin system lets teams ship business capabilities as installable, configurable, reviewable applications rather than one-off prompts.

- Package plugins with metadata, configuration schemas, lifecycle hooks, server modules, entities, services, and strategy providers.
- Declare `targetApps` and `targetAppMeta` so the host can understand plugin surfaces such as Workbench views, Assistant tools, business apps, templates, MCP servers, and resources.
- Add custom Workbench views or React iframe Remote Components for human review, upload, correction, approval, and operational workflows.
- Expose narrow Agent middleware tools with structured schemas and ordered call flows.
- Deliver Assistant templates so users can create business assistants with the right prompts, tools, plugins, and starter tasks in one step.
- Extend the ecosystem through the official and community plugin repositories.

### File & Knowledge Understanding

Xpert gives agents controlled access to documents, files, and enterprise knowledge.

- Maintain knowledge bases with document parsing, chunking, embeddings, retrieval testing, and dynamic updates.
- Use File Understanding to represent uploads as `FileAsset` records, artifacts, chunks, page images, citation anchors, and workspace file paths.
- Combine knowledge retrieval, GraphRAG-style entity evidence, and file-aware tools for document-heavy workflows.
- Use workspace files and knowledge resources as auditable context instead of relying on unstructured prompt stuffing.

### ChatKit & Embedding

ChatKit is the embeddable conversation framework for Xpert-powered assistants.

- Use React, Vue, Vue 2, Angular, SAP UI5, Web Component, or vanilla JavaScript packages.
- Support streaming responses, tool call visualization, file uploads, threads, i18n, theming, and host automation.
- Embed Xpert agents into product surfaces while keeping the backend workflow, tool, and governance logic on the Xpert platform.
- Render richer tool results through widgets, MCP Apps, and workbench visualizations where appropriate.

## Architecture

Xpert follows an **Agent-Workflow Hybrid Architecture**: agents provide flexible reasoning and tool choice, while workflows provide stable, inspectable control paths. This lets teams combine natural-language problem solving with enterprise requirements for repeatability, review, and governance.

![agent-workflow-hybrid-architecture](https://github.com/user-attachments/assets/b3b432f9-54ab-4ec1-9fc4-7e46fbfb88ba)

[Blog - Agent-Workflow Hybrid Architecture](https://xpertai.cn/en/blog/agent-workflow-hybrid-architecture)

## Repository Guide

This repository is an Nx monorepo. Important areas include:

| Path                                               | Purpose                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/api`                                         | Main NestJS API application and platform bootstrap.                                                         |
| `apps/cloud`                                       | Angular web application for the Xpert Cloud UI, Agent Studio, workspaces, settings, and workbench surfaces. |
| `packages/server-ai`                               | Agent execution, chat, model providers, toolsets, MCP, knowledge, handoff, and AI runtime services.         |
| `packages/server`                                  | Core server modules shared by the platform.                                                                 |
| `packages/contracts`                               | Shared TypeScript contracts used by frontend, backend, SDKs, and plugins.                                   |
| `packages/plugin-sdk`                              | SDK for building Xpert plugins, view extensions, configuration forms, permissions, and remote components.   |
| `packages/plugins`                                 | Built-in plugin packages shipped with the host.                                                             |
| `packages/core`, `packages/angular`, `packages/ui` | Core data/analytics libraries and reusable UI packages.                                                     |
| `docker`                                           | Docker Compose deployment files and environment templates.                                                  |

Related repositories:

| Repository                                                   | What it contains                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [`xpert-plugins`](https://github.com/xpert-ai/xpert-plugins) | Official and community plugins, including integrations, models, middleware, tools, Skills, and Agentic Apps.       |
| [`chatkit-js`](https://github.com/xpert-ai/chatkit-js)       | Embeddable ChatKit packages for React, Vue, Angular, UI5, Web Component, browser extension, widgets, and examples. |
| [`xpert-sdk-js`](https://github.com/xpert-ai/xpert-sdk-js)   | TypeScript SDK packages and examples for calling Xpert APIs.                                                       |
| [`xpert-skills`](https://github.com/xpert-ai/xpert-skills)   | Public Skill examples, templates, and the Agent Skills specification.                                              |
| [`docs`](https://github.com/xpert-ai/docs)                   | Product, AI, plugin, data, BI, and tutorial documentation.                                                         |

## Quick Start

> Before installing Xpert, make sure your machine meets the following minimum system requirements:
>
> - CPU >= 2 Core
> - RAM >= 4 GiB
> - Node.js (ESM and CommonJS) - 20.x, 22.x

The easiest way to start the Xpert server is through [docker compose](docker/docker-compose.yml). Before running Xpert with the following commands, make sure that [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) are installed on your machine:

```bash
cd xpert
cd docker
cp env.example .env
docker compose up -d
```

After running, you can access the Xpert dashboard in your browser at [http://localhost/onboarding](http://localhost/onboarding) and start the initialization process.

For installation and startup instructions, see the [official documentation](https://docs.xpertai.cn/en/ai/getting-started/community).

Visit the [Xpert AI official website](https://xpertai.cn/en/) for more information.

Please check our [Wiki - Development](https://github.com/xpert-ai/xpert/wiki/Development) to get started quickly.

## Demo, Cloud, and Production

### Demo

Xpert AI Platform Demo is available at <https://app.xpertai.cn>.

Notes:

- You can generate sample data from the home dashboard page.

### Production (SaaS)

Xpert AI Platform SaaS is available at <https://app.xpertai.cn>.

Note: it is currently in Alpha/testing mode, so please use it with caution.

## Technology Stack and Requirements

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

For production, we recommend:

- [PostgreSQL](https://www.postgresql.org)
- [PM2](https://github.com/Unitech/pm2)

## Ecosystem & Status

| Area                              | Status                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Agent orchestration and workflows | Core platform capability, including multi-agent systems, workflow nodes, toolsets, knowledge bases, and middleware.           |
| Agentic BI                        | Active product capability around semantic models, indicators, ChatBI, and natural-language analysis.                          |
| Data Xpert / UOSE                 | Active data and ontology capability for governed resource discovery, action execution, approvals, and audit.                  |
| Plugins and Agentic Apps          | Active ecosystem with plugin marketplace, SDK, Workbench views, Remote Components, middleware tools, MCP tools, and MCP Apps. |
| ChatKit                           | Available as a multi-framework embeddable chat framework with streaming, tools, uploads, threads, widgets, and i18n.          |
| Skills                            | Available as reusable instruction/resource packages that can be installed into workspaces and loaded by agents.               |
| SDKs                              | TypeScript SDK is available; Python SDK is planned.                                                                           |
| Observability and operations      | Ongoing work across usage reporting, Prometheus metrics, conversation goals, runtime operations, trace, and evaluation.       |

## Roadmap

Near-term development is focused on a few platform-level directions:

- [ ] **Project workspaces**: AI-assisted planning, files, teams, Kanban-style task execution, and project-scoped agent collaboration.
- [ ] **Governance and compliance**: stronger audit logs, role-based access control, approval flows, policy coverage, and enterprise deployment controls.
- [ ] **Trace and evaluation**: deeper observability for agent runs, workflow paths, tool calls, context usage, and evaluation feedback loops.
- [x] **Plugin and Agentic App ecosystem**: richer marketplace metadata, easier local development, more official business apps, and safer plugin-managed MCP runtimes.
- [x] **SDK and embedding surfaces**: broader SDK coverage, ChatKit improvements, and smoother integration paths for existing enterprise products.
- [ ] **Operations and reliability**: monitoring, alerting, retention policies, runtime controls, and production hardening for self-hosted deployments.

## Contact Us

- Business inquiries: <mailto:service@xpertai.cn>
- [Xpert AI Platform @ Twitter](https://x.com/xpertai_cloud)

## License

We support the open-source community.

This software is available under the following licenses:

- [Xpert AI Platform Community Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-community-edition-license)
- [Xpert AI Platform Enterprise Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-small-business-license)
- [Xpert AI Platform Enterprise Pro Edition](https://github.com/xpert-ai/xpert/blob/main/LICENSES.md#xpert-ai-platform-enterprise-license)

Please see [LICENSE](LICENSES.md) for more information on licenses.

## Thanks to Our Contributors

**Contributors**

<a href="https://github.com/xpert-ai/xpert/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=xpert-ai/xpert" />
</a>

- Please give us a star on GitHub. It helps!
- You are welcome to submit feature requests in the [Xpert AI repo](https://github.com/xpert-ai/xpert/issues).
- Pull requests are always welcome. Please base pull requests against the _develop_ branch and follow the [contributing guide](.github/CONTRIBUTING.md).
