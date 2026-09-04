# @xpert-ai/contracts

## 3.18.1

### Patch Changes

- e260743: plugin mcp

## 3.18.0

### Minor Changes

- 8e63a8b: Release Xpert 3.18.0.

### Patch Changes

- dad112d: Add authoritative Project View runtime scopes, membership and scheduling contracts, read/edit/manage action access, immutable Xpert workspace data scopes, scoped Connector bindings with personal or shared authorization, eligible expert providers, Project-scoped workspace files, and collaboration support.
- 1c71b75: Add Project-scoped Connector authorization and scheduled tasks that run as a confirmed Project member.
- d45a0c8: Add governed Project instructions and skills with sandbox read-only enforcement.

## 3.17.6

### Patch Changes

- afb69b7: Release Xpert 3.17.6 after publishing the complete Sandbox Runtime image suite.

## 3.17.5

### Patch Changes

- 9e59e41: Add stable tenant- and organization-scoped MCP publication, capability, authentication, execution context, tool result, resource, prompt, app, task, and change-event contracts for the Xpert MCP publishing platform.

  Keep plugin schema contracts on the Zod v3 compatibility API while allowing consumers to install Zod 3.25 or Zod 4.

## 3.17.4

### Patch Changes

- 7b6954a: project

## 3.17.3

### Patch Changes

- 754866e: Add reusable enterprise H5 identity and single-assistant session contracts.

## 3.17.2

### Patch Changes

- fa1306a: Add conditional LLM pricing rules, provider-reported price authority, cache and add-on components, mixed cache-write TTL pricing, recurring daily price windows frozen at invocation start, and component-aware multi-unit usage reporting for specialized models.

## 3.17.1

### Patch Changes

- 612baea: Resolve model parameter defaults consistently across configuration UIs and runtime model creation, and expose provider parameter rules through the plugin SDK.

## 3.17.0

### Minor Changes

- 747732e: v3.17

### Patch Changes

- e44e5bc: Add shared IMAGE and VIDEO model clients, Managed Queue checkpoints for asynchronous AIGC jobs, host-owned model provider resolution, authoritative model usage reporting, and versioned token/generation/second usage accounting for model plugins.

## 3.16.0

### Minor Changes

- b800da5: v3.16

## 3.15.18

### Patch Changes

- 2f6bf18: Support localized plugin display names and descriptions across plugin metadata, the platform registry, and marketplace dialogs.

## 3.15.17

### Patch Changes

- 0a90701: release 3.15.17

## 3.15.16

### Patch Changes

- 90a268b: Initialize assistant template prompt workflows as reusable workspace commands.

## 3.15.15

### Patch Changes

- 8a0eba3: Calculate membership points proportionally, constrain tokens-per-point settings to safe presets, expose non-duplicated point usage by runtime organization in Copilot usage summaries, and support tiered model pricing.
- 5d4a308: Support multiple provider help links in integration configuration while preserving the legacy single-link fallback.

## 3.15.14

### Patch Changes

- 8a46f00: Expose shared marketplace categories and recommended template metadata through the Xpert marketplace contracts.

## 3.15.13

### Patch Changes

- 25664c9: Persist and aggregate conversation task summaries and enable the responsive summary card with resource opening in ClawXpert.

## 3.15.12

### Patch Changes

- b8bac1f: Add system-plugin Sandbox Actions, the action-oriented Sandbox Jobs Core, provider-neutral Runtime Definitions, the minimal Runtime Provider/workspace mapper SPI, Worker heartbeat health, and Browser execution-pool capability discovery.
- b905a58: Publish the Workbench file-open command key, file payload, and evidence payload contracts for host and plugin reuse.

## 3.15.11

### Patch Changes

- aa16ee9: Publish a browser-safe collaboration client entry at `@xpert-ai/plugin-sdk/collaboration-client`.

## 3.15.10

### Patch Changes

- c9d8401: collaboration & artifacts

## 3.15.9

### Patch Changes

- 601438f: fix org membership plan

## 3.15.8

### Patch Changes

- 7ab7aa1: Add connector contracts, management UI, runtime APIs, and connector middleware support.
- 121ced0: Final stable version

## 3.15.7

### Patch Changes

- 3249145: plugin artifact namespace

## 3.15.6

### Patch Changes

- 0473ce2: upgrade kb

## 3.15.5

### Patch Changes

- 693806f: workspace files

## 3.15.4

### Patch Changes

- bdcb73b: handoff messages

## 3.15.3

### Patch Changes

- 481ffba: file understanding & vector store

## 3.15.2

### Patch Changes

- 8fded17: plugin scope for tenant

## 3.15.1

### Patch Changes

- c1e4da2: managed queue

## 3.15.0

### Minor Changes

- 6f679b8: fix plugin tenant scope & human chat files types

## 3.14.0

### Minor Changes

- 54cff15: tenants and managed connections
- 6978bfd: release plugin tenant scope

## 3.13.0

### Minor Changes

- e6528c8: mcp apps

### Patch Changes

- f23228b: client commands for extension view

## 3.12.1

### Patch Changes

- 6a17eca: plugin sdk and mcp toolset close

## 3.12.0

### Minor Changes

- d017897: plugin integration guard

## 3.11.0

### Minor Changes

- d92d0f2: upgrade zard ui

## 3.10.1

### Patch Changes

- 49101da: release

## 3.10.0

### Minor Changes

- df9d7e2: agentic app

## 3.9.9

### Patch Changes

- 2acc11a: fqa of xpert agent

## 3.9.8

### Patch Changes

- 2558760: updates

## 3.9.5

### Patch Changes

- 9e37ff9: updates

## 3.9.4

### Patch Changes

- 07057a6: pet of chatkit

## 3.9.3

### Patch Changes

- ea234e5: skills & middleware selection
- 4920c48: Add runtime-selectable sub-agent connection metadata.

## 3.9.2

### Patch Changes

- 8187f99: Update chatkit

## 3.9.1

### Patch Changes

- e040933: Tenant shared workspace to organization's users

## 3.9.0

### Patch Changes

- 4dcf5b5: add sso in plugin sdk
- 7fff870: beta 2
- c76facd: beta v
- 5b5c8ef: Updates

## 3.9.0-beta.2

### Patch Changes

- Updates

## 3.9.0-beta.1

### Patch Changes

- beta v
