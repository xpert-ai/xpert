# Agent Plugin installation scope

Git, ZIP and default imports install packages in the authenticated tenant or organization scope. ChatKit lists the current organization's installations plus inherited tenant packages; an organization package with the same manifest name takes precedence, including when disabled. Users need access to the published Assistant, not authoring membership in its workspace.

An imported package has a stable, versioned catalog reference immediately. Optional administrator configuration uses `POST /agent-plugins/bindings` without workspace targets. New configurations set `definition.availability = "scope"`. The read-only Desktop catalog is `GET /agent-plugins/catalog`. Legacy workspace endpoints remain for older clients, but are no longer part of the installation flow.

Catalog reads do not install skills, toolsets or Connector bindings. When a user selects an authorized plugin, the runtime prepares its skills and MCP toolsets for the Assistant's workspace. Preparation is serialized per binding across API instances. Workspace projection records are implementation details and do not restrict plugin visibility. Tenant packages retain their tenant ownership; runtime resources and connections belong to the consuming organization and workspace.

Existing binding IDs, versions, expert revisions and installation maps remain valid. Legacy workspace configurations are preferred in their original workspaces when enabled. Elsewhere, an enabled configuration can be reused without copying its workspace Connector credentials. Superseded references still resolve at their pinned version while enabled; disabling the effective scope configuration also blocks older selections. A reference never grants access by itself: Assistant, package, expert, toolset and Connector access are rechecked during use.

Missing expert mappings or connections are shown as configuration required. Existing shared Connector bindings are reused through the Assistant-authorized Connector API; runtime preparation never creates a connection or grants authorization. OAuth registration and connection management retain their existing management flow.

## Default import progress

`POST /agent-plugins/defaults` accepts `{}` and returns HTTP 202 with a background import receipt. `GET /agent-plugins/defaults` reads the current scope's receipt. Both require the same administrator and tenant/organization context as other imports. Callers cannot override the official source or target scope.

Poll/resume with `POST /agent-plugins/defaults` and `{ "operationId": "<receipt ID>" }`. Repeated requests join the same job; a resume of a terminal job returns its receipt without starting another import. After an API restart, an authenticated resume acquires the released worker lock and continues the pinned Git commit, skipping recorded outcomes. An explicit `{}` retry of a failed job retains its snapshot and progress; after a completed job, `{}` requests a fresh catalog import.

Progress is stored in tenant settings under a tenant-and-organization-specific ID. The short job-creation lock is separate from the worker lock, so status and resume requests do not wait for Git or package imports. Existing setup callers retain the final-result `ImportDefaultAgentPluginsCommand` contract and use this same job machinery outside HTTP. API and Web should be deployed together for the asynchronous response contract.

## Database upgrade

The TypeORM base entities already allow a nullable organization. Databases created with the original standalone Agent Plugin SQL must apply `migrations/20261012-agent-plugin-installation-scope.sql` before creating tenant installations. It only drops the organization `NOT NULL` constraints; it does not change IDs, versions, scope ownership or configuration data.

## Updates, repair and conservative cleanup

`POST /agent-plugins/packages/:id/update` accepts `{ "branch": "main" }` and returns HTTP 202 with an `AgentPluginUpdateProgress` receipt. It follows `refs/heads/<branch>`, not an inferred semantic version or tag. Existing official imports default to the official `main` branch; custom Git imports default to their recorded ref, and fixed commits need an explicit branch. ZIP packages use ZIP reupload. The worker checks that the manifest name still matches the selected plugin. `GET /agent-plugins/updates` restores the current scope's receipt; resume via the same update endpoint with `{ "operationId": "..." }`. Resumes retain their fetched commit, and completed receipts never start a new job. Receipts and advisory locks are scoped by tenant and organization. No credentials are persisted.

Explicit updates choose the fetched package as the catalog default, including when Git reverts to previously imported content. The new default retains the prior enabled/disabled state and compatible expert mappings. Existing binding IDs, versions, installations, conversation selections and Assistant dependency locks are not rewritten. New connector requirements come from the new manifest and still require normal authorization. Updating does not migrate an already installed Assistant to a new template.

All Git, ZIP and default reimports verify the stored package digest. Missing or damaged files are copied into a fresh verified directory, then the original package record switches paths without changing its ID, digest, creation time or bindings. Retired paths enter a durable tenant-setting queue in the same transaction. Collection happens after commit; failed deletion can be retried. Symlinked or out-of-scope storage paths are rejected rather than recursively removed. The storage root must be on durable storage shared by API workers, as for existing package imports.

`GET /agent-plugins/packages/:id/cleanup` previews old versions of the same manifest name in the exact installation scope. `POST` to that path accepts `{ "packageIds": ["..."] }` and rechecks every candidate under locks. It always retains the newest import, active update targets, every package with a user configuration, reserved template reference or workspace installation (including disabled and historical configurations), and packages whose immutable ID, digest or synthetic binding ID occurs in persisted JSON. The conservative scan includes registered entity JSON/JSONB/simple-JSON columns in the installation scope (across consuming organizations for tenant packages), including drafts, history, template installations and execution snapshots; it can retain extra versions rather than risk removing a reference. Legacy serialized stores without entity metadata are additionally protected by their persistent runtime bindings. This is not a force-uninstall or cascading deletion feature.

Cleanup shares import/configuration locks and synthetic-reference locks with runtime preparation. Template dependency resolution reserves its reference before returning a dependency lock. Cleanup never removes derived Skills, MCP tools, Connector grants or user data. Retired directory deletion is durable and retryable; a database rollback cannot delete live files. Both endpoints require the same administrator and scope checks as imports. Before deploying to databases maintained with the standalone SQL migrations, apply `migrations/20261015-agent-plugin-maintenance.sql`. Its new `cleanupEligible` flag defaults to false, preserving every existing binding. Only new automatic update defaults can be collected; template selection or explicit enable/disable reserves them.

Regression commands (from repository root):

```sh
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand packages/server-ai/src/agent-plugin
corepack pnpm exec jest --config apps/cloud/jest.config.ts --runInBand --runTestsByPath apps/cloud/src/app/features/setting/plugins/agent-plugins/agent-plugins.component.spec.ts
```

The PostgreSQL/filesystem suite also runs when `AGENT_PLUGIN_TEST_DATABASE_URL` points to a disposable PostgreSQL database. It creates and drops only a uniquely named test schema and temporary package directories. It covers repair, duplicate imports, explicit updates, cleanup references, concurrent reservations, scope isolation and rollback.

Lock holders reuse their database connection for receipt and reference reads/writes, including package imports by background workers. This prevents connection-pool starvation while other requests wait on the same locks. The PostgreSQL suite includes one-connection tests for template reservations, concurrent default-import requests, and both background workers, plus resolution of an existing conversation reference after update, cleanup and repair.
