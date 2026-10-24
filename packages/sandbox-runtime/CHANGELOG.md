# @xpert-ai/sandbox-runtime

## 1.3.1

### Patch Changes

- d80b159: Include Poppler and validate LibreOffice, fonts and two-page UTF-8 extraction before document preview execution. Add the isolated LibreOffice NsJail binding and retain dependency, conversion, extraction and timeout diagnostics. Publish a new Runtime Suite artifact and regenerate production digest bindings through the release workflow; existing production locks are not changed by this source fix.

## 1.3.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

## 1.2.3

### Patch Changes

- 4bc3aa0: Add managed offline Node and Java document Runtime profiles, pinned conversion and OCR dependencies, PDF page rendering, and serialized health probes with bounded failure caching.

## 1.2.2

### Patch Changes

- 0ca2b96: Publish the document-python Runtime image with an explicit Python version tag.
  Preserve existing browser and LibreOffice tags, reject missing image versions,
  and verify Python image metadata against the runtime manifest and definition.
  Bump the Runtime Suite so the release workflow builds and publishes its source
  images before platform-version aliases are created.

## 1.2.1

### Patch Changes

- ba10381: Release the document Sandbox Runtime image family.

## 1.2.0

### Minor Changes

- 0a90701: release 3.15.17

## 1.0.1

### Patch Changes

- b269a84: Add development-only Runtime Bindings and the OSS Local Browser Runtime used for source-checkout PDF/PPTX export tests, while keeping production execution fail-closed.
