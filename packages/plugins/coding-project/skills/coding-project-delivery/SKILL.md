---
name: coding-project-delivery
description: Develop and independently accept a Coding Project inside the cloud Computer, or run its full release Pipeline with human approval, authorized target verification and Git delivery.
---

# Coding Project delivery

Preflight a new request with `coding_delivery_targets` before planning or reading implementation manuals.
Use its machine-readable `mode`, `ready` and `blockers`. The Project configuration
`deliveryMode` defaults to `local`. The user can explicitly request `release`.
Choose release for explicit delivery outside the Computer, and local for development
and testing confined to it. A no-push constraint alone does not change deployment scope.
If the user requests external deployment but prohibits Git delivery, clarify that scope
before starting the full release workflow. Do not guess scope from target names or invent a destination.

- `local`: start `coding_delivery_start` with mode `local`. The native
  `coding_project.local@1.0.0` pipeline owns development, deployment inside the existing
  cloud Computer, real functional tests, separate execution review and accepted artifact
  delivery. Empty target/repository lists are normal. No external credential, Git remote,
  human release gate, host-platform installation, remote push or npm publication is needed.
  A local source commit and recoverable source archive or bundle are permitted.
- `release`: start with mode `release` only after the preflight passes. Administrators
  authorize target/repository scope and credentials. The complete pipeline adds human
  release approval, exact-package target verification and remote Git delivery. Missing
  configuration blocks release, not the independent local workflow. Report it briefly;
  do not spend another planning turn or attempt start with known-empty destinations.

When preflight reports `CODING_DESTINATION_SELECTION_REQUIRED`, choose `targetKey`
and `repositoryKey` from the authorized lists using the request, then preflight again.
Clarify ambiguous choices; multiple authorized choices do not mean missing configuration.
Retries keep the original mode and destinations, and recheck their current authorization.

Preflight checks workflow configuration only. Discovering a Coding runtime is not proof
that its login, dependencies or development instance work. Delegate those checks and
bounded recovery to the cloud CLI. `parsed_file_list` lists parsed attachments, not all
files in the cloud Computer. Do not describe it as a machine filesystem inventory.

Once started, use the persisted operation mode even if Project defaults later change.
Do not duplicate the platform scheduler or ask the user for another stage instruction.
When `coding_delivery_start` returns `nextAction=finish_coordination_turn`, report the
Pipeline identifiers and finish the initial conversation immediately. The platform
has dispatched a separate stage conversation. Do not adopt its operation or create,
dispatch, poll or wait for tasks in the initial conversation. Only a stage invocation
owns implementation and independent-review coordination.
Local work finishes after formal independent acceptance and `coding_delivery_submit`;
report the package, source, instance address and actual test evidence. Later publication
starts a separate release using `acceptedTaskId`, preserving the accepted package.

When asked to release a previously completed deliverable, pass mode `release` and its `acceptedTaskId`
to `coding_delivery_start`. Reuse its formal independent acceptance, exact package,
version and business source. The first stage only prepares missing release metadata,
source commit/bundle and immutable exports; its independent review checks provenance
and file identity. Do not develop another program, rebuild/repack the accepted package
or repeat unchanged inner-instance business tests. After human approval, verify that
same package on the target instance. Missing release metadata is not a reason to redo
the business implementation.

For a stage invocation, never call `coding_delivery_start` again, including when the
quoted original requirement mentions it. Call `coding_delivery_context` with its operation ID. Its live
JSON Schema, work identity, requirement, authorized target and candidate are authoritative.
Read `cloud-project-delivery` for task delegation and independent execution review.
Use program-specific environment/development skills; for Xpert plugins, use
`xpert-plugin-development` and `xpert-platform-local-environment` in the existing Computer.
The coordinator reads the delegation/review procedure and stage schema, then assigns
the task. Put relevant program-specific skill paths in the CLI brief; let the CLI read
implementation manuals as needed. On a technical retry, inspect and reuse existing
tasks and evidence before creating another task. Do not mistake a Pipeline coordinator
execution for a Computer task holding the workspace.
When retrying under a new operation ID, update an unfinished task's manifest work identity
to the current stage context before dispatching it; use the latest task revision.

The main Assistant coordinates; Coding CLI tasks perform implementation, environment
setup, packaging, installation, real checks and ordinary repairs. A different review
session independently checks the actual environment. A successful CLI exit is not
acceptance. Read findings, request bounded rework when necessary, then formally decide
the task using `project_decide_task`.

Bind new inner instances to the current Project using `--project-root` on the
repository local-environment CLI. Keep checkout and mutable database/plugin state
project-exclusive; share dependency/runtime/build caches only. Resume the same
instance on a same-project retry. Do not adopt an earlier project's healthy port
as the test environment. Keep a plugin's canonical package name and installation
scope stable across versions; a new version uses the update path without first
uninstalling the previous version. Different packages sharing a tool name are a
registration conflict, not evidence that one supersedes the other.

Development-service operations also belong to the Coding CLI. For Xpert, use the
repository's `tools/local-environment/cli.py start/status/logs/restart/stop` and the
`xpert-platform-local-environment` skill. Prepare with `--supervisor-mode detached`
for locally started Supervisor processes. The CLI may use its own shell/session
facilities, and services may stop when the task completes or is cancelled. Give the
reviewer the exact checkout, state and startup commands; it checks and starts the
same instance again before testing the unchanged candidate. Keep project data and
credentials across attempts. The platform retains isolation, resource limits and
task cleanup; the coordinator need not relay service operations.
`sandbox_service_start` is a host Assistant tool, not a CLI command or required
prerequisite. Record logs and test evidence, and stop services when finished.

For new stage work, create one `kind: summary` delivery task, then create its
implementation child with `parentTaskId`. Only dispatch the implementation child.
Use `reviewAsSubtask: true` when dispatching review, with `taskId` identifying the
implementation child. The host returns the review task ID and reuses it for retries
of the same candidate; a new implementation gets a new review task. Read the returned
review task for its findings. A completed review can conclude `changes_required` or
`indeterminate`; it does not complete the delivery. Do not arrange review-of-review.
Make `project_decide_task` decisions on the summary with its current revision and
the child implementation/review evidence. Submit that accepted summary task ID.
Do not convert existing tasks or move historical executions into a new hierarchy.
Preserve their original acceptance path when resuming an existing stage.

Each work stage exports a `delivery-manifest.json` matching its supplied schema and
all referenced files through file delivery. Manifest file references contain the exact
file name and SHA-256; Artifact IDs are assigned by the host after export. Include all
those Artifact references in the formal task acceptance. Submit the accepted task and
manifest Artifact ID with `coding_delivery_submit`. The host checks current operation,
task acceptance, independent review and immutable bytes.

Development fixes a local source commit before final packaging/acceptance, and exports
a recoverable source archive or Git bundle, installable package, concise report and
release notes. This stage includes testing in the inner development Xpert. In local mode, formal
acceptance and sealed artifacts finish the pipeline. In release mode, it stops before
cross-instance deployment, at human release approval. Do not invent a configured base
branch for local work; export a complete local archive or Git bundle.

After approval, `coding_delivery_materialize` restores the frozen artifacts into the
Project workspace. For `deployment: current-instance`, the destination is the host Xpert running this
pipeline, not the inner cloud Computer instance. Use the 1.1.0 pipeline. Its host
installation node runs after human approval and before your acceptance stage. Do not
install, rebuild or repack the candidate. Read the saved host receipt using
`coding_delivery_test_access` with `inspect`. For an MCP plugin, development declares
`acceptance: {type: "mcp", componentKey: "<actual component>"}` in its manifest. Use
`prepare_tests` to obtain a two-hour publication-scoped credential file. Pass only the
path to the cloud CLI; never print, prompt, export or commit the secret. Use
`computerBaseUrl` as the reachable origin and preserve the endpoint path. Assign real
functional tests and a separate independent review; installed/loaded is not acceptance.
If the host installation node is blocked, report that node and its evidence instead
of retrying installation from Shell or asking the user for administrator credentials.

For `deployment: cli`, install the same package on the configured authorized target;
do not rebuild. Resolve credentials only via the configured reference without exposing
them. Inspect prior side effects before retrying. Restart and replace conflicting old
test plugins only within the provided target permissions. Verify installed/loaded
identity and real business calls, with a new independent review. Health is not acceptance.

For `repository.delivery: github`, use `coding_delivery_git` with `inspect`, then
`deliver` when needed. It consumes the approved `sourceFormat: git-bundle` artifact
and the configured GitHub Connector, which must also be authorized in this Assistant's
graph. Credentials stay in the host process. The fixed program imports objects into a
temporary bare repository without checking out or executing candidate code. It creates
only the approved new branch and creates/reuses its PR. An existing different commit
is a conflict; a retry must not overwrite it. Delegate independent remote commit/PR
and recoverable-source verification to the CLI, then submit its accepted Git manifest.
For CLI mode, use the configured credential reference in its authorized environment.
Code delivery pushes the same approved commit to a scoped branch, and creates or reuses
a PR when configured. Check the remote commit and PR head; never force-push or merge.
Preserve the exact recoverable source artifact. PR creation is not merge or publication.

When an approved candidate needs business changes, preserve the review findings and
call `coding_delivery_rework`. A new Round obtains new development evidence and human
approval. Ordinary transient infrastructure recovery stays in the current task. Inspect
unknown install/push/PR outcomes before retrying; do not blindly replay side effects.

During human waiting, finish the Agent turn and release the CLI. Apply existing managed
service idle policy; do not keep a shell polling for approval. Keep user-facing updates
focused on outcomes and blockers; technical identities belong in tools and evidence.
