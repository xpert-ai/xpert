# Artifact working drafts

`ArtifactDraftsRuntimeCapability` (`platform.artifact-drafts`) is a generic platform API for mutable working copies. It has no dashboard, SQL, chart, or Agent tool semantics. Workspace Files stores the bytes; `artifact_draft` stores a content pointer, checksum and monotonically increasing revision.

- `list(artifactIds)` reads up to 100 authorized draft records in one batch for selectors and lists.
- `get(artifactId)` returns the authorized owner's current working copy.
- `save({artifactId, expectedRevision, expectedCurrentVersionId, ...content})` verifies the Workspace file and saves a revision. Use revision `0` when no draft exists. It never creates a formal Artifact version.
- `publish({artifactId, expectedRevision, expectedCurrentVersionId})` is a trusted application action after human confirmation. Do not expose it as an Agent tool. It publishes the exact reviewed draft as an immutable Artifact version and records the confirming actor and revision in version metadata.

Both mutations lock the Artifact row, sharing the same lock as ordinary version writes. Publication checks the draft revision and its base version, inserts the snapshot, advances the formal current version, and marks the draft published in one transaction. An identical publication retry returns the same version; stale writes or publication against a different current version fail. Publishing never silently rebases a draft.

Draft access is owner scoped and requires an active Artifact. Saving a draft leaves the formal current-version pointer and title unchanged; draft-aware selectors read the working title from the draft. Confirmed publication updates the formal title and version pointer atomically. Published versions and share links retain their existing behavior; links never expose unpublished drafts. File checksums, MIME policy and canonical Workspace authorization apply to drafts. Dependency snapshots can be part of the application-owned content package and therefore remain pinned in both drafts and published versions.

Installations with external schema management must apply `packages/server-ai/src/artifacts/drafts/migrations/20261017-artifact-drafts.sql`. Existing Artifacts require no backfill: the first edit starts at revision 0 against the current formal version. There is one current working copy per Artifact; immutable formal version history is retained. Intermediate draft revisions are concurrency markers, not a browsable version-history feature.

## Verification

Set `ARTIFACT_DRAFTS_TEST_DATABASE_URL` to a dedicated PostgreSQL database whose name starts with `xpert_artifact_drafts_test_`, then run `corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand --runTestsByPath packages/server-ai/src/artifacts/drafts/artifact-drafts.integration.spec.ts`. The suite creates and drops its own schema and temporary files, runs the SQL migration twice, and uses real platform authorization, file reads, row locks and transactions. Without the variable, this database suite is skipped. Existing Artifact share-session regression tests additionally require a test-only `JWT_SECRET` when run outside a configured local environment.

## Agent completion evidence

`createMutationEvidence<T>()` tracks pending writes and successful domain receipts within a run. Adapters decide which tools begin mutations and which exact receipts prove a commit. A late receipt cannot clear a newer pending write. Use this to require further tool calls while a write is pending and to fail truthfully when the tool budget is exhausted. A Workspace file-write acknowledgement is not a domain save receipt.

The Live Dashboard plugin owns its schema, preflight, Binding queries, tool policy, preview UI and publication confirmation. After editing the Workspace copy, the Agent must call the dashboard create/update tool to validate and save it. Middleware tracks pending edits and requires a matching domain save receipt before reporting completion; writing a file alone never saves a dashboard. The Workbench pins query requests to the saved draft revision or immutable formal version; neither target accepts browser-supplied bindings or native queries.
