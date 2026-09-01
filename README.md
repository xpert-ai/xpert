English | [简体中文](./README_zh.md)

<p align="center">
  <a href="https://xpertai.cn/en/">
    <img src="docs/images/logo.png" alt="Xpert AI" width="220">
  </a>
</p>

<h1 align="center">Everything is a Plugin</h1>

<p align="center">
  Xpert is an open-source Agent platform where models, integrations, tools, middleware, Skills,<br>
  Assistants, Workbench views, MCP Apps, and complete Agentic Apps share one governed plugin system.
</p>

<p align="center">
  <a href="https://app.xpertai.cn/plugins/marketplace"><strong>Explore the Plugin Marketplace</strong></a> ·
  <a href="https://github.com/xpert-ai/xpert-plugins"><strong>Browse Plugin Source</strong></a> ·
  <a href="https://github.com/xpert-ai/xpert-skills/tree/main/skills/development-technical/xpert-plugin-development"><strong>Develop with Agent Skills</strong></a> ·
  <a href="https://docs.xpertai.cn/en/ai/getting-started/community"><strong>Self-host Xpert</strong></a> ·
  <a href="https://docs.xpertai.cn/en/">Documentation</a>
</p>

<p align="center">
  <a href="https://github.com/xpert-ai/xpert">
    <img src="https://img.shields.io/github/stars/xpert-ai/xpert?style=flat&logo=github" alt="GitHub stars">
  </a>
  <a href="https://www.npmjs.com/package/@xpert-ai/contracts">
    <img src="https://img.shields.io/npm/v/@xpert-ai/contracts.svg?logo=npm&logoColor=fff&label=contracts" alt="@xpert-ai/contracts on npm">
  </a>
  <a href="LICENSES.md">
    <img src="https://img.shields.io/badge/Community-AGPL--3.0-blue" alt="Community Edition: AGPL-3.0">
  </a>
</p>

![Plugin-delivered Assistant templates in the Xpert AI Agent Marketplace](docs/images/readme/agent-marketplace-en.png)

The Xpert core provides the runtime, contracts, security boundaries, and lifecycle controls. Plugins provide the capabilities and applications that users install: from a model provider or tool to a complete Assistant, multi-Agent workflow, or business-facing Agentic App.

| Discover                                                                                                                | Learn                                                                                                         | Build                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find and install capabilities and applications in the [Plugin Marketplace](https://app.xpertai.cn/plugins/marketplace). | Study official and community implementations in [`xpert-plugins`](https://github.com/xpert-ai/xpert-plugins). | Give a coding agent the [`xpert-plugin-development`](https://github.com/xpert-ai/xpert-skills/tree/main/skills/development-technical/xpert-plugin-development) skill to create, test, deploy, version, and prepare plugins for release. |

## See Xpert in action

![Motion Assistant in Agent Studio with tools and middleware connected to one agent](docs/images/readme/agent-studio-motion-en.png)

This is a live Agent Studio configuration for **Motion Assistant**. One agent is connected to Skills, web tools, sandbox capabilities, retry and loop-guard middleware, and operational controls. The same visual model can combine multiple agents with deterministic Workflow nodes when a process needs stricter control.

## Why Xpert

- **Everything is a governed plugin** — install and evolve models, integrations, middleware, Skills, MCP tools and Apps, Assistant templates, Remote Components, Workbench views, and complete Agentic Apps through one lifecycle.
- **Agent and Workflow hybrid architecture** — use agents for flexible reasoning and workflows for stable, inspectable control paths.
- **Governed enterprise execution** — expose data and business actions through typed tools, semantic objects, policies, approvals, and audit trails instead of handing models raw access.
- **Human-reviewable workbenches** — let tool calls open focused UI views where users can inspect, correct, approve, or submit results.

## Official Apps

Explore Xpert's first-party Agentic Apps in the [official App catalog](https://xpertai.cn/apps/):

- [Presentation Studio](https://xpertai.cn/showcase/presentation-studio/)
- [Sites](https://xpertai.cn/showcase/sites/)
- [DOCX Editor](https://xpertai.cn/showcase/docx-editor/)
- [Canvas](https://xpertai.cn/showcase/canvas/)
- [Pencil](https://xpertai.cn/showcase/pencil/)
- [draw.io](https://xpertai.cn/showcase/drawio/)
- [Excalidraw](https://xpertai.cn/showcase/excalidraw/)
- [Lucidchart](https://xpertai.cn/showcase/lucidchart/)

## Quick Start

The Docker path requires at least **2 CPU cores**, **4 GiB RAM**, Docker, and Docker Compose.

```bash
git clone https://github.com/xpert-ai/xpert.git
cd xpert/docker
cp env.example .env
docker compose up -d
```

Open [http://localhost/](http://localhost/) and complete the initialization flow.

For deployment options, environment configuration, and upgrades, follow the [self-hosting documentation](https://docs.xpertai.cn/en/ai/getting-started/community). For source development, use a supported Node.js LTS release and the repository-pinned pnpm version through Corepack.

## Platform Map

| Area                                 | What it enables                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent Studio**                     | Visual authoring for digital experts, multi-agent collaboration, Workflow nodes, toolsets, knowledge, Skills, and Agent Middleware.           |
| **File and Knowledge Understanding** | Parsed file assets, chunks, page images, citation anchors, retrieval, GraphRAG-style evidence, and workspace files.                           |
| **Agentic BI and Data Xpert**        | Semantic models, indicators, natural-language analysis, and governed object-semantic tools for enterprise data queries and actions.           |
| **Agentic Apps and Workbench**       | Plugin-delivered business applications with Assistant tools, review views, Remote Components, configuration, and lifecycle hooks.             |
| **MCP, Skills, and Plugins**         | Reusable integrations, model providers, tools, middleware, managed runtimes, and installable capability packages.                             |
| **ChatKit and Embedding**            | Streaming assistants for React, Vue, Angular, SAP UI5, Web Components, and vanilla JavaScript, with files, threads, tools, widgets, and i18n. |
| **Operations**                       | Conversation and task state, tool-call events, usage reporting, logs, metrics, retention controls, and runtime monitoring.                    |

## Architecture

Xpert follows an **Agent-Workflow Hybrid Architecture**. Agents decide how to solve open-ended tasks; workflows make critical paths repeatable and reviewable. Tools, knowledge, data resources, and plugin surfaces remain behind explicit contracts and governance boundaries.

![Agent-Workflow Hybrid Architecture](https://github.com/user-attachments/assets/b3b432f9-54ab-4ec1-9fc4-7e46fbfb88ba)

[Read the architecture article](https://xpertai.cn/en/blog/agent-workflow-hybrid-architecture).

## Ecosystem

| Repository                                                   | Purpose                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`xpert-plugins`](https://github.com/xpert-ai/xpert-plugins) | Official and community integrations, model providers, middleware, tools, Skills, and Agentic Apps. |
| [`chatkit-js`](https://github.com/xpert-ai/chatkit-js)       | Embeddable ChatKit packages, widgets, and examples for multiple frontend frameworks.               |
| [`xpert-sdk-js`](https://github.com/xpert-ai/xpert-sdk-js)   | TypeScript SDK packages and examples for calling Xpert APIs.                                       |
| [`xpert-skills`](https://github.com/xpert-ai/xpert-skills)   | Agent Skills for setting up Xpert and developing plugins, Agentic Apps, Assistants, and pipelines. |
| [`docs`](https://github.com/xpert-ai/docs)                   | Product, AI, plugin, data, BI, deployment, and tutorial documentation.                             |

## Local Development with Agent Skills

Use the development skills from [`xpert-ai/xpert-skills`](https://github.com/xpert-ai/xpert-skills) to let a supported coding agent set up the platform and build Agentic Apps against a verified local Xpert instance.

Install the two primary skills and their plugin lifecycle companion for Codex. Remove `--global` if you only want to install them for the current project.

```bash
npx skills add xpert-ai/xpert-skills \
  --skill xpert-platform-local-environment \
  --agent codex \
  --global

npx skills add xpert-ai/xpert-skills \
  --skill xpert-agentic-app-developer \
  --agent codex \
  --global

npx skills add xpert-ai/xpert-skills \
  --skill xpert-plugin-development \
  --agent codex \
  --global
```

Replace `codex` with another target supported by the Skills CLI when necessary. Start a new agent session after installation if the skills are not discovered immediately.

Then ask the coding agent to run the workflow in order:

1. **Set up and verify Xpert**

   > Use `$xpert-platform-local-environment` to clone or reuse an Xpert checkout at `<path>`, set it up in source-hybrid mode, start it, and return a plugin-test-ready environment receipt.

2. **Build the Agentic App**

   > Use `$xpert-agentic-app-developer` to design, implement, securely deploy, and verify `<app description>` as an independent Xpert Agentic App plugin against the verified local platform.

The environment skill defaults to Docker-managed infrastructure with the API and Cloud UI running from source. It verifies checkout and process provenance, service health, and whether required human initialization is complete. The Agentic App skill covers plugin architecture, Agent middleware, Workbench and extension views, Assistant templates, marketplace `appConfig`, deployment, and acceptance. Follow its handoff to `xpert-plugin-development` for plugin packaging and deployment details.

## ROADMAP

The current roadmap prioritizes:

- Project workspaces for planning, files, teams, and task execution.
- Stronger governance, approval, audit, and role-based access controls.
- Deeper trace and evaluation across Agent runs, workflows, tools, and context usage.
- Monitoring, retention, runtime controls, and production hardening for self-hosted deployments.

## Community

- Report bugs or request features in [GitHub Issues](https://github.com/xpert-ai/xpert/issues).
- Read the [contributing guide](.github/CONTRIBUTING.md) before opening a pull request. Contributions should target the `develop` branch.
- Business inquiries: [service@xpertai.cn](mailto:service@xpertai.cn)

<a href="https://github.com/xpert-ai/xpert/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=xpert-ai/xpert" alt="Xpert AI contributors">
</a>

If Xpert is useful to you, please consider giving the repository a star.

## License

The Xpert AI Platform Community Edition is licensed under the [GNU Affero General Public License v3.0](LICENSES.md#xpert-ai-platform-community-edition-license). Small Business and Enterprise commercial licenses are also available. See [LICENSES.md](LICENSES.md) for the complete terms.
