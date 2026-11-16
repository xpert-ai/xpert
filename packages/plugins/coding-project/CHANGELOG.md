# @xpert-ai/plugin-coding-project

## 0.3.0

- Add a default local development and independent acceptance Pipeline without external destinations.
- Add Project workflow selection and compact configuration preflight; retain existing release authority and evidence.
- Distinguish missing release configuration from destination selection; pin destinations and revalidate authorization on retries.
- Return an explicit coordination handoff after Pipeline startup to avoid duplicate task dispatch.
- Allow published Project Assistants to read non-secret effective runtime configuration without management privileges.

## 0.2.0

### Minor Changes

- 2ae6a77: Add the canonical Coding Project plugin with its own configuration schema, delivery pipeline, Assistant template and skills. Use native host installation after exact-candidate human approval, with plugin-owned delivery evidence and independent acceptance.

### Patch Changes

- 5a4ac30: Preserve template executor bindings when assigning the delivery coordinator so current-instance pipelines retain their host plugin installer and pass startup configuration validation.
- 8a639bb: Define execution review, pinned review subjects, structured findings and rework references for Project tasks. Reuse ProjectTasksApi for scoped, read-only acceptance receipts; keep the passing execution-review requirement in the Coding Project plugin. Validate safe relative candidate and evidence paths without imposing Computer snapshot directory exclusions on generic task reports.
- Updated dependencies [6b9b857]
- Updated dependencies [5bfc27b]
- Updated dependencies [c238eb6]
- Updated dependencies [7c65f33]
- Updated dependencies [1e59570]
- Updated dependencies [608ce5f]
- Updated dependencies [eb44fd1]
- Updated dependencies [4e56d50]
- Updated dependencies [8a639bb]
- Updated dependencies [674b534]
- Updated dependencies [db88c62]
- Updated dependencies [b0ef7bf]
- Updated dependencies [f5b727d]
- Updated dependencies [bd53631]
  - @xpert-ai/plugin-sdk@3.35.0
  - @xpert-ai/contracts@3.35.0
