# @xpert-ai/server-config

## 3.26.1

## 3.26.0

### Patch Changes

- 54778dc: Extend the existing schema-sync deployment job with TypeORM SQL migrations. Ordinary tables still synchronize from entities; explicitly SQL-managed tables are excluded. Package module-local SQL and checks, preserve migration checksums, support verified baseline adoption, and serialize host/plugin DDL using a shared PostgreSQL lock.

  Disable API startup DDL in development as well as production. Share installed plugin mounts with Compose migration jobs and fail on incomplete plugin registration. Preserve legitimate undispatched ModelExecution calls during baseline adoption, with regression coverage for independently reconstructed legacy databases.

## 3.25.0

### Minor Changes

- 3e0460d: Align the core platform packages on a shared release line. API, Cloud, Contracts, SDK and server foundations move together to the next minor version.

## 3.10.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

## 3.9.0
