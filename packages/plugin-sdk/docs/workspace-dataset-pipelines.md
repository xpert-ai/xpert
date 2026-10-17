# Workspace live script queries and dashboard Datasets

Status: implemented in the current source tree. The platform provides generic execution capabilities, and `@xpert-ai/plugin-analytics-workspace-script` provides the Python/JavaScript adapter. Before deployment, independently verify compatible SDK/contracts packages, the compute image and the Runtime Binding. Successful local integration does not establish production release readiness.

This document uses the script provider to illustrate how platform capabilities compose. `workspace_script.*`, script definitions, language entrypoints and the plugin limits below belong to this plugin; they are not a protocol that every Analytics provider must adopt. See [Analytics](analytics.md) for the generic data and presentation boundaries, and the [HTML document host](artifact-documents.md) for the browser isolation protocol.

Each dashboard open, filter change or manual refresh reruns the script against current inputs and returns a normalized Dataset. Routine refreshes require no LLM calls. Automatic push updates and scheduled polling are outside this version's scope.

## Query flow

```text
Dashboard Artifact + controls
  → Analytics Runtime (current actor, parameters, executionId, deadline, signal)
  → workspace_script.query provider
  → Definition Artifact/version + current file authorization + execution code snapshot
  → Sandbox Jobs / compute Runtime
      query(ctx)
       ├─ sources.query(alias, controls) → invocation → Analytics → source plugin
       └─ files.read(alias) → invocation → Workspace Files
  → Plugin validates columns/rows and trusted execution evidence
  → Platform normalizeAnalyticsResult
  → Live Dashboard: Data Analytics renderer or isolated HTML page
```

Multiple charts can reuse the same Dataset. Each actual query receives a new executionId and Job idempotency key, so it runs again even when parameters are unchanged. This does not automatically deduplicate separate page calls. Temporary outputs belong to the current execution and cannot serve as a cache for the next query.

## Modules and responsibility boundaries

| Module                                        | Implemented responsibilities                                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-sdk` Analytics capability             | Generic Dataset/Binding/discovery interfaces; provider context includes executionId, deadlineAt and ancestry; trusted internal query execution propagates signal/deadline                                           |
| `server/data-source/analytics`                | Assign execution IDs before dispatch; enforce parent/child deadlines, cancellation, source reauthorization, nesting depth and recursion limits                                                                      |
| `plugin-sdk` jsonEncodedSchema                | Decode JSON text once at explicitly enabled input boundaries, then apply the original strict schema; shared by script registration and dashboard saves without automatically relaxing HTTP or persistence protocols |
| `plugin-sdk` Sandbox Jobs capability          | `run(input, options?)`, with signal and a named invocation handler in options; callbacks are not serialized, and actor parameters are not accepted from HTTP                                                        |
| `server-ai/sandbox/sandbox-job`               | Job lifecycle, bounded stdout invocation sessions, actor context preservation, cancellation and cleanup; no SQL/ontology/CSV logic                                                                                  |
| `server-ai/shared/volume` and Workspace Files | Existing published Assistant/Project ACLs, portable references, path and symlink restrictions; a dedicated cleanup entrypoint for Job roots                                                                         |
| Sandbox Runtime Suite                         | Generic compute profile and Node/Python image; non-root execution, no network, read-only inputs and resource limits                                                                                                 |
| Pro Docker Runtime Provider                   | Read-only task mounts, separate output tmpfs, live output streaming, bounded output reads and cancellation cleanup; replaceable by a provider with equivalent capabilities                                          |
| `analytics-workspace-script` plugin           | Definition schema, language entrypoints, CSV helpers, alias authorization, result constraints and lineage                                                                                                           |
| PostgreSQL / data-xpert plugins               | Native queries, credentials, resource policies and data semantics; scripts invoke only Binding aliases                                                                                                              |
| Live Dashboard plugin                         | Saves, filters, refreshes, stale-response protection, preview receipts, standard charts/tables and custom HTML presentation                                                                                         |

No script-specific business table is introduced. Definitions and execution evidence use existing Artifact/ArtifactVersion records; tasks use SandboxJob. The platform does not interpret script business semantics, and charts do not interpret SQL, ontology Actions or script languages.

## Protocol and persistence

The generic Binding uses `providerId: workspace_script.query`, `operation: query` and `contractVersion: 1`, with source type `workspace-script`. Its payload contains only the definition's `artifactId/versionId`; parameters bind controls, and output declares the datasetId, stable field IDs, types, units and grain.

The plugin definition uses `xpert.analytics-script/v1`:

- `runtime` pins the Action name and version, currently `workspace_script.execute@1.0.0`.
- `language`, `mode`, the `script` portable reference and `scriptSha256` identify the code.
- `authorization` retains the original Assistant file reference; pinned snapshots still require rechecking the original permissions.
- `files` maps aliases to authorized portable references; `sources` maps aliases to complete source Bindings.
- `parameters/output` must exactly match the outer Binding; saving cannot silently substitute a different contract.

`pinned` fixes the code snapshot while reading current inputs. `current` rereads the code on each execution and creates an immutable snapshot for that execution. Definitions are currently owned by their creator; sharing a dashboard does not automatically expand script or file permissions.

Execution Artifacts store the executionId, Job ID, definition version, code SHA, parameter digest, input file SHAs/read times, child queries and source execution IDs, and output SHA. The source timestamp uses the earliest input read time in the execution; execution time is not presented as business dataAsOf. No automatic audit-retention TTL is introduced.

## Script entrypoints

```python
async def query(ctx):
    dataset = await ctx.sources.query("sales", {"region": ctx.parameters.get("region")})
    return ctx.dataset([
        {"region": row["region"], "amount": row["amount"]}
        for row in dataset["rows"]
    ])
```

```javascript
export async function query(ctx) {
  const file = await ctx.files.read('orders')
  const records = ctx.csv.parse(file.text)
  return ctx.dataset(records.map((row) => ({ region: row.region, amount: row.amount })))
}
```

Source Dataset rows use `field.id`; script output uses the definition's `sourceField`. decimal/int64 values must remain exact strings. Python can use Decimal, and JavaScript can use integer minor units/BigInt, converting results back to exact strings. Results may contain only columns/rows; scripts cannot issue freshness, provenance or completeness claims.

The second argument to a source query supplies controls for the predeclared Binding, mapped by controlId. Scripts cannot replace the source, native payload, actor or credentials. CSV helpers remain in the plugin. Only the Python/Node standard libraries are available by default; arbitrary packages are not installed.

## Invocation during generic execution

`SandboxJobRunOptions.invocation` registers operations, maxCalls, maxBytes and a trusted handler. Dedicated JSONL frames on container stdout carry id/operation/payload. After validation, the platform calls the handler and writes the response through the Runtime file API into the current Job's response directory, which is read-only inside the container. Docker has no network access; scripts receive neither tokens nor HTTP addresses.

The platform uses AsyncResource to preserve the trusted caller context and checks duplicate IDs, allowed operations and quotas. Sessions close when the Job completes, fails or is cancelled. Any Runtime Provider can implement this protocol through live output and file uploads. Requests currently execute in the owning API process; reconnect recovery and resumption across API processes are not implemented.

The plugin forwards `source.query` to Analytics Runtime and `file.read` to Workspace Files. Each call revalidates the definition, original Assistant and input permissions. Source actor tokens and database passwords remain in the platform/source plugins. Child queries inherit the parent deadline and cancellation signal, and recursive source calls are prohibited.

## Isolation and limits

The compute profile requires hardened, ephemeral execution, resource limits, no network, a non-root user, a read-only root filesystem and a read-only Workspace. Development mode cannot bypass the readOnlyWorkspace capability requirement. The Pro provider uses read-only task mounts and a separate 64 MB output tmpfs, with a trusted reader that rejects output symlinks and oversized files.

The total query deadline is 30 seconds. Compute execution defaults to 25 seconds with a hard limit of 30 seconds, 1 CPU and 256 MB of memory. Scripts are limited to 64 KB; up to 8 file aliases, each with a 1 MB UTF-8 file; up to 4 source aliases; 16 invocations/8 MB of invocation data; at most 4,000 source rows in total; and at most 1,000 result rows/2 MB. Longer tasks require a future unified asynchronous query protocol.

Files remain consistent within an execution after their first read. Reading multiple sources does not create a cross-system transactional snapshot. Upstream truncation/pagination propagates to the final result; aggregates over partial inputs cannot claim to be complete totals. The platform validates output fields, types and grain before returning the result, then removes temporary outputs.

The frontend uses request sequence numbers to discard late responses. The server uses deadlines and cancellation signals to reclaim executions. The current UI has no user-facing Job cancellation button, and changing filters does not guarantee immediate interruption of all previous queries.

## Two presentation modes

Standard mode uses `bindings + controls + charts/tables`. The plugin maps the normalized Dataset to the existing Data Analytics renderer; a Binding itself does not describe chart types or layout.

HTML mode uses `bindings + controls + presentation.html`, with empty `charts/tables`. The page calls `window.xpertLiveArtifact.query(bindingId, controls)` to obtain a Dataset, then uses its own JavaScript and stable field IDs to render DOM/SVG/Canvas. `subscribe` receives filter and refresh results. Host refreshes reuse the latest control values without reloading the HTML. The page does not need to know whether data comes from SQL, an ontology or a script.

Both modes save query definitions, not result snapshots. HTML and Bindings belong to the same Artifact version; the backend loads the Binding from that version and reauthorizes the current user. Frontend chart scripts in HTML and the backend Workspace data-processing scripts described here run in separate environments: the former render the page, while the latter access inputs through governed aliases in a Sandbox Job.

## One-sentence Agent generation

The Agent first discovers actual data and metric definitions, writes a script through Workspace tools, and registers it with structured parameters. Before registration, source Bindings are checked with default parameters, so invalid native query configurations fail before the script starts. Registration returns the complete bindingJson. `dashboard_preview_binding` previews it unchanged and issues a receipt for the current generation run; `dashboard_create` or `dashboard_create_html` can save only with successful receipts. HTML mode also reads the page from an authorized Workspace and runs an isolated browser preflight with real default Dataset results before saving. This flow reuses normal dashboard validation for business semantics, grain and default filters; it does not save model-invented result snapshots. A dedicated Assistant can configure allowedFinalProviders in LiveDashboard middleware to restrict the final saved provider while permitting upstream previews from other providers. The script acceptance Assistant uses workspace_script.query; ordinary Assistants have no such restriction by default.

Earlier live acceptance runs used the same nine-order fixture through Python CSV, JavaScript PostgreSQL, data-xpert semantic sources and data-xpert SSO pages. Historical results and repeatable isolated tests are documented in `xpert-plugins/community/tools/analytics-workspace-script/docs/acceptance.md`. Historical model and SSO acceptance for standard/HTML dashboards is in `xpert-plugins/community/apps/live-dashboard/docs/`. This documentation review does not mean those scenarios were rerun.

## Release boundaries

Local compute images and integration against a source checkout do not constitute a production release. Release requires updated SDK/contracts packages, a built and published compute image, a generated digest catalog/Binding, and validation of the target Runtime Provider's capabilities. Existing local execution receipts do not replace these steps.

New exports such as `jsonEncodedSchema` must exist in the SDK actually used. An old peer semver range or stale local dist does not establish compatibility. Before migrating an existing plugin to a shared helper, verify the SDK release version and dependency constraints, then remove the original implementation. Temporary SDK builds and test doubles do not prove that an older published package supports a new API.
