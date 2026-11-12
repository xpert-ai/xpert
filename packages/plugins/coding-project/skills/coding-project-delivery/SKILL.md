---
name: coding-project-delivery
description: Deliver a Coding Project through its native four-stage Project Pipeline, with cloud Coding CLI implementation, independent acceptance, human release approval, authorized target verification and exact-commit Git delivery.
---

# Coding Project delivery

The initial functional request starts the complete delivery. Use `coding_delivery_start`
once; the platform dispatches each stage and resumes delegated tasks. Do not duplicate
its scheduler or ask the user to prompt deployment and testing. Administrators configure
target/repository scope and credentials once. Human release approval is a separate,
explicit decision on a concrete candidate in the native Pipeline View.

When asked to release a previously completed deliverable, pass its `acceptedTaskId`
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
release notes. This stage includes testing in the inner development Xpert. It stops
before cross-instance deployment, at human release approval.

After approval, `coding_delivery_materialize` restores the frozen artifacts into the
Project workspace. For `deployment: current-instance`, use the 1.1.0 pipeline. Its host
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
