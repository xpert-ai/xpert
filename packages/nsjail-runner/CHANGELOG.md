# @xpert-ai/nsjail-runner

## 0.4.0

### Minor Changes

- 47c4d17: Bind Sandbox jobs and host callbacks to durable execution generations. Redeliver original-target control, retain capacity until runtime and attached work actually settle, prevent implicit replay, and support explicit retries of settled generations. Add provider evidence and conservative legacy migration.

## 0.3.1

### Patch Changes

- Publish a develop candidate for the released NsJail runtime baseline synchronized from main, including the Compute and document runtime bindings and their image acceptance checks.

## 0.3.0

### Minor Changes

- c59009d: Add a built-in NsJail Compute Runtime Provider so open-source deployments can run Python and JavaScript Workspace Script Actions without a Pro Runtime Provider. The Runner includes the pinned Compute rootfs and a separate authenticated, offline Jobs protocol with read-only inputs, bounded scratch storage, cgroup v2 resource limits, streamed host invocations and deterministic cleanup. Update both API and Runner together; Compute remains unavailable on older Runners or without cgroup v2 isolation.
- 06be3c0: Provide hardened open-source NsJail bindings for AnyDoc and OpenDataLoader document Jobs, with locked native/Java/OCR dependencies, isolated profile lifecycles and real image acceptance checks. Correct document Artifact catalog families and validate release metadata. Deploy the matching API and Runner together; existing Runners fail document readiness closed.

### Patch Changes

- d80b159: Include Poppler and validate LibreOffice, fonts and two-page UTF-8 extraction before document preview execution. Add the isolated LibreOffice NsJail binding and retain dependency, conversion, extraction and timeout diagnostics. Publish a new Runtime Suite artifact and regenerate production digest bindings through the release workflow; existing production locks are not changed by this source fix.

## 0.2.2

### Patch Changes

- 1acb35c: Request a develop candidate for the NsJail runtime updates synchronized from main. Include the managed application-data verification script in the image and gate candidate publication on the image's protocol, isolation, and application-data checks.

## 0.2.1

### Patch Changes

- b8d81f7: Publish Runner protocol 3 with managed `.apps` data protection. Require an image Changeset for NsJail runtime changes and verify the published image's isolation, file channels and protected application data before updating candidate aliases.

## 0.2.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 79cc75a: Publish application Docker images only for their own Changesets. Build scoped candidates, require consumed Changesets for stable releases, and check that shared package releases include their consuming applications.
