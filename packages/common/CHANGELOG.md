# @xpert-ai/server-common

## 3.28.0

### Patch Changes

- a520041: Run registry plugin installation asynchronously with bounded execution and process-group cleanup. Serialize shared-store mutations across API replicas, validate legacy installations, publish complete artifacts and manifests atomically, and propagate staging failures before runtime activation. Keep admission deadlines and restart capacity checks intact; verify slow installations overlapping rolling restarts through readiness-aware ingress.

## 3.27.0

## 3.26.2

## 3.26.1

## 3.26.0

## 3.25.0

### Minor Changes

- 3e0460d: Align the core platform packages on a shared release line. API, Cloud, Contracts, SDK and server foundations move together to the next minor version.

## 3.10.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

## 3.9.0
