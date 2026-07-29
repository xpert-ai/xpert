# @xpert-ai/plugin-sdk

## 3.15.18

### Patch Changes

- 2f6bf18: Support localized plugin display names and descriptions across plugin metadata, the platform registry, and marketplace dialogs.
- Updated dependencies [2f6bf18]
  - @xpert-ai/contracts@3.15.18

## 3.15.17

### Patch Changes

- 0a90701: release 3.15.17
- Updated dependencies [0a90701]
  - @xpert-ai/contracts@3.15.17

## 3.15.16

### Patch Changes

- 90a268b: Initialize assistant template prompt workflows as reusable workspace commands.
- Updated dependencies [90a268b]
  - @xpert-ai/contracts@3.15.16

## 3.15.15

### Patch Changes

- a26a776: Add opt-in multi-auth connector strategies, provider-neutral runtime credentials, and legacy credential mapping.

  Integration-enabled plugins can also opt into inherited tenant and organization configuration reads for connector-owned OAuth apps.

  Existing `ConnectorDefinition`, `ConnectorStrategy`, `ConnectorRuntimeCredential`, `ConnectorRuntimeApi.getConnector()`, and legacy registry accessors remain available unchanged. New providers can implement `ConnectorMultiAuthStrategy`, while runtime consumers can adopt `getConnectorCredential()` when the host exposes it.

- 8a0eba3: Calculate membership points proportionally, constrain tokens-per-point settings to safe presets, expose non-duplicated point usage by runtime organization in Copilot usage summaries, and support tiered model pricing.
- e3d3c26: Add a machine-readable stale steer callback error and close the execution-completion race before channel follow-ups are persisted.
- Updated dependencies [8a0eba3]
- Updated dependencies [5d4a308]
  - @xpert-ai/contracts@3.15.15

## 3.15.14

### Patch Changes

- Updated dependencies [8a46f00]
  - @xpert-ai/contracts@3.15.14

## 3.15.13

### Patch Changes

- b269a84: Add development-only Runtime Bindings and the OSS Local Browser Runtime used for source-checkout PDF/PPTX export tests, while keeping production execution fail-closed.
- Updated dependencies [25664c9]
  - @xpert-ai/contracts@3.15.13

## 3.15.12

### Patch Changes

- b8bac1f: Add system-plugin Sandbox Actions, the action-oriented Sandbox Jobs Core, provider-neutral Runtime Definitions, the minimal Runtime Provider/workspace mapper SPI, Worker heartbeat health, and Browser execution-pool capability discovery.
- Updated dependencies [b8bac1f]
- Updated dependencies [b905a58]
  - @xpert-ai/contracts@3.15.12

## 3.15.11

### Patch Changes

- aa16ee9: Publish a browser-safe collaboration client entry at `@xpert-ai/plugin-sdk/collaboration-client`.
- Updated dependencies [aa16ee9]
  - @xpert-ai/contracts@3.15.11

## 3.15.10

### Patch Changes

- c9d8401: collaboration & artifacts
- Updated dependencies [c9d8401]
  - @xpert-ai/contracts@3.15.10

## 3.15.9

### Patch Changes

- 601438f: fix org membership plan
- Updated dependencies [601438f]
  - @xpert-ai/contracts@3.15.9

## 3.15.8

### Patch Changes

- 121ced0: Final stable version
- Updated dependencies [7ab7aa1]
- Updated dependencies [121ced0]
  - @xpert-ai/contracts@3.15.8

## 3.15.7

### Patch Changes

- 5e553ae: Add connector strategy contracts and runtime capability helpers for workspace connector plugins.

## 3.15.6

### Patch Changes

- 3249145: plugin artifact namespace
- Updated dependencies [3249145]
  - @xpert-ai/contracts@3.15.7

## 3.15.5

### Patch Changes

- 0473ce2: upgrade kb
- Updated dependencies [0473ce2]
  - @xpert-ai/contracts@3.15.6

## 3.15.4

### Patch Changes

- 693806f: workspace files
- Updated dependencies [693806f]
  - @xpert-ai/contracts@3.15.5

## 3.15.3

### Patch Changes

- bdcb73b: handoff messages
- Updated dependencies [bdcb73b]
  - @xpert-ai/contracts@3.15.4

## 3.15.2

### Patch Changes

- 481ffba: file understanding & vector store
- Updated dependencies [481ffba]
  - @xpert-ai/contracts@3.15.3

## 3.15.1

### Patch Changes

- 8fded17: plugin scope for tenant
- Updated dependencies [8fded17]
  - @xpert-ai/contracts@3.15.2

## 3.15.0

### Minor Changes

- c1e4da2: managed queue

### Patch Changes

- Updated dependencies [c1e4da2]
  - @xpert-ai/contracts@3.15.1

## 3.14.0

### Minor Changes

- 6f679b8: fix plugin tenant scope & human chat files types

### Patch Changes

- Updated dependencies [6f679b8]
  - @xpert-ai/contracts@3.15.0

## 3.13.0

### Minor Changes

- 54cff15: tenants and managed connections
- 6978bfd: release plugin tenant scope

### Patch Changes

- Updated dependencies [54cff15]
- Updated dependencies [6978bfd]
  - @xpert-ai/contracts@3.14.0

## 3.12.2

### Patch Changes

- f23228b: client commands for extension view
- Updated dependencies [e6528c8]
- Updated dependencies [f23228b]
  - @xpert-ai/contracts@3.13.0

## 3.12.1

### Patch Changes

- 6a17eca: plugin sdk and mcp toolset close
- Updated dependencies [6a17eca]
  - @xpert-ai/contracts@3.12.1

## 3.12.0

### Minor Changes

- d017897: plugin integration guard

### Patch Changes

- Updated dependencies [d017897]
  - @xpert-ai/contracts@3.12.0

## 3.11.2

### Patch Changes

- 7418eef: version

## 4.0.0

### Minor Changes

- d92d0f2: upgrade zard ui

### Patch Changes

- Updated dependencies [d92d0f2]
  - @xpert-ai/contracts@3.11.0

## 3.11.0

### Minor Changes

- 49101da: release

### Patch Changes

- Updated dependencies [49101da]
  - @xpert-ai/contracts@3.10.1

## 3.10.0

### Minor Changes

- a83c9ea: fix

## 4.0.0

### Minor Changes

- df9d7e2: agentic app

### Patch Changes

- Updated dependencies [df9d7e2]
  - @xpert-ai/contracts@3.10.0

## 3.9.9

### Patch Changes

- Updated dependencies [2acc11a]
  - @xpert-ai/contracts@3.9.9

## 3.9.8

### Patch Changes

- 2558760: updates
- Updated dependencies [2558760]
  - @xpert-ai/contracts@3.9.8

## 3.9.5

### Patch Changes

- 9e37ff9: updates
- Updated dependencies [9e37ff9]
  - @xpert-ai/contracts@3.9.5

## 3.9.4

### Patch Changes

- Updated dependencies [07057a6]
  - @xpert-ai/contracts@3.9.4

## 3.9.3

### Patch Changes

- ea234e5: skills & middleware selection
- Updated dependencies [ea234e5]
- Updated dependencies [4920c48]
  - @xpert-ai/contracts@3.9.3

## 3.9.2

### Patch Changes

- 8187f99: Update chatkit
- Updated dependencies [8187f99]
  - @xpert-ai/contracts@3.9.2

## 3.9.1

### Patch Changes

- e040933: Tenant shared workspace to organization's users
- Updated dependencies [e040933]
  - @xpert-ai/contracts@3.9.1
  - @xpert-ai/ocap-core@3.9.1

## 3.9.0

### Patch Changes

- 4dcf5b5: add sso in plugin sdk
- 7fff870: beta 2
- c76facd: beta v
- 5b5c8ef: Updates
- Updated dependencies [4dcf5b5]
- Updated dependencies [7fff870]
- Updated dependencies [c76facd]
- Updated dependencies [5b5c8ef]
  - @xpert-ai/contracts@3.9.0
  - @xpert-ai/ocap-core@3.9.0

## 3.9.0-beta.2

### Patch Changes

- Updates
- Updated dependencies
  - @xpert-ai/contracts@3.9.0-beta.2
  - @xpert-ai/ocap-core@3.9.0-beta.2

## 3.9.0-beta.1

### Patch Changes

- beta v
- Updated dependencies
  - @xpert-ai/contracts@3.9.0-beta.1
  - @xpert-ai/ocap-core@3.9.0-beta.1
