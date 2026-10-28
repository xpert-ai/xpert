# Plugin-owned database workbench

The SDK defines `DatabaseWorkbenchAdapter`, its wire types and the existing
`platform.datasource.workbench` capability. Database implementations belong to
plugins. Adding an engine does not require a platform engine enum or dispatch branch.

A registered `IDataSourceStrategy` opts in with `workbench: { engine: '<stable-id>' }`.
The host lists that declaration without opening connections, selects the strategy
using the saved datasource type, then calls `create(savedOptions)` to obtain an
independent runner. `runner.getWorkbenchAdapter(location?)` creates the adapter.
Its engine identifier must match the strategy declaration.

The plugin interprets and validates `DatabaseLocation`, implements SQL syntax,
metadata discovery, parameter binding, database/schema selection and driver cleanup.
It must not treat location fields as credentials, identity or arbitrary driver options.
The host retains actor/tenant/organization checks, source authorization and revision
checks, write permission checks and session cleanup. Every invocation revalidates
host scope. The adapter and runner are closed when the saved connection changes.

Consumers resolve the existing capability by its stable string ID. Do not dispatch
plugin-side CQRS commands or import platform services. No new factory capability or
parallel plugin registry is introduced.

## Breaking migration

The SDK no longer exports its mixed-engine `SqlDatabaseWorkbenchAdapter`,
`WorkbenchTransport`, `splitWorkbenchSql`, `requireReadStatement`,
`quoteDatabaseIdentifier`, or SQL pagination/lexer implementations. Use the
corresponding database plugin implementation and the plugin repository's
`@xpert-ai/sql-workbench` helpers. MySQL/Doris, PostgreSQL and DB Studio are migrated
in the companion plugin change; HANA implements the same contract independently.

Strategies without an explicit workbench declaration are not exposed by this
runtime. Coordinate the host/SDK patch release with the migrated plugins; do not
upgrade a host that still relies on the removed SDK implementation exports.
After the SDK is published, update the plugin SDK dependency floors and lockfile
and validate a clean install against that actual version before release.
