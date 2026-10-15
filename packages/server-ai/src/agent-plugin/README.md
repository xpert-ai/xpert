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
