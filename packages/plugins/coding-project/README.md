# Coding Projects

Built-in system plugin: `@xpert-ai/plugin-coding-project`.

Owns the Coding Project type (two-hour task default), delivery Assistant, skills,
four-stage Project Pipeline and its versioned release evidence. It consumes public
SDK capabilities; it does not import host server internals or run a second scheduler.

The host retains generic Project tasks, CLI execution, independent review, formal
task decisions, Artifact storage, authorization and Pipeline durability. The project
type is `@xpert-ai/plugin-coding-project:coding` / `coding`. No legacy project-type
alias or automatic migration is registered.

Stages: development and independent acceptance → human release confirmation →
installation and independent acceptance on an authorized target → exact-commit Git
delivery or PR. A stage result must be an immutable Artifact from the current formally
accepted task, with independent execution review. Technical identity validation does
not replace the review Agent's business judgment.

To release a previously accepted task, pass `acceptedTaskId` to `coding_delivery_start`.
The host pins its formal decision, revision and independent review. The first stage
only fills missing release metadata and immutable exports, preserving the original
package bytes and reusing its business acceptance. It does not redevelop, rebuild or
repack the plugin. The preparation reviewer checks provenance and file identity; the
deployment reviewer checks the same package on the newly authorized target. Explicit
business rework starts a new Round and may produce a new candidate. Revoking or changing
the original acceptance invalidates the pinned source reference.

Before use, an administrator configures `targets` and `repositories`, each with an
explicit `projectIds` allowlist. Empty lists grant no destination. Configuration
stores credential references only; actual secrets remain in the selected environment's
secret store. This version supports development/acceptance targets. A reference is not
proof that credentials are present: stage execution verifies readiness and reports a
specific blocker if they are unavailable.

Provision/select the Project and authorize its ID before its first delivery request.
An automatically created Project does not inherit access to another Project's targets.
Both destination URLs use credential-free HTTP(S). For `deployment: cli`, configure
the CLI credential helper or target login separately. For `deployment: current-instance`,
the `coding_project.delivery@1.1.0` pipeline includes a native host installation node.
The human gate freezes the package Artifact, hash and replace/restart permissions. The
host reads that decision itself, installs the package and records immutable evidence;
unknown outcomes are inspected without replaying installation. The coordinator then
uses `coding_delivery_test_access` to read the receipt or request a bounded MCP test
credential file, and assigns real business tests plus an independent review to the CLI.
The plugin no longer exposes an installation tool or an authorization callback.
Use `computerBaseUrl` as the reachable origin while preserving the MCP endpoint path.
Select the 1.1.0 configuration for current-instance delivery and the 1.0.0
configuration for CLI-target delivery.
A repository URL alone does not provide Git write credentials.

For fixed GitHub delivery, configure the repository with `delivery: "github"` and a
`connectorBindingId`. Install the GitHub Connector provider, create a shared connection
authorized for this Project and repository, and explicitly select that connection in
the delivery Assistant's Connector node before publishing it. Prefer a repository-scoped
GitHub App with Contents and Pull requests write permissions. Plugin configuration is
an allowlist, not a substitute for the host's Connector authorization. No token belongs
in the configuration or requirement. Configuration changes require a new delivery Round.

The development manifest declares `sourceFormat: "git-bundle"`; its incremental bundle
must recover the approved commit using the configured repository's base history.
`coding_delivery_git` first inspects the remote, imports that immutable bundle into a
temporary bare repository, then creates only the approved branch. It does not check
out or execute candidate code, force-push, merge, or put GitHub credentials in the
Computer. A trusted pre-push hook rejects nonempty remote refs, including concurrent
fast-forward races. Retries reconcile remote commits and PRs before writing again.
`git` and CA certificates are included in the API image; source-mode hosts need Git on
the standard executable path. Temporary repositories and auth state are removed after
each operation. Real remote/business verification still needs an independent CLI task;
private repositories require authorized read access in that task environment.

With `delivery: "cli"` (the default), configure the CLI credential
helper separately. The CLI performs Git delivery and the same independent review.

Install the included Assistant template with a selected model and compatible cloud
Coding Runtime. Bind its Project to the configuration matching its deployment mode
in the native Pipeline View. A Project manager's first `coding_delivery_start` may create
this binding; an autonomous Assistant principal uses a binding configured beforehand.
Add program-specific development/environment skills as appropriate. Target and
repository configuration is read on demand, and revocation stops advancement.

Review the candidate, target and restart impact through the native human gate before
authorizing release. The Agent has no approval tool. Changed source, artifacts or
target require a new Round and new approval; transient technical failures use existing
task/Pipeline recovery. Inspect unknown remote effects before another install/push/PR.

Git writes are restricted to the candidate's `releaseScope.branch`
(`coding-delivery/<delivery-id>/v<requirement-revision>`). The base branch is the PR
destination, not a push destination. Human rejection dispatches a coordination step
that reads feedback and starts a new round. The current generic gate has no text-comment
field; when a rejection includes no explanatory evidence, the coordinator must ask the
publisher for the reason instead of guessing. Rework uses the original coordinating
Assistant or a Project manager, matching the host's new-round authorization.

The packaged `cloud-project-delivery` skill is vendored from the corresponding
`xpert-skills/skills/development-technical` source. Keep its reference files together.
The generic CLI model profiles and Computer isolation remain platform infrastructure.

Native Pipeline model budgets default to 2,000,000 tokens. A signed-in human Project
owner or manager can inspect the effective policy, usage and audit history with
`GET /api/xpert-project/:projectId/pipelines/:instanceId/native-model-budget`.
To increase the existing instance ceiling, call
`POST /api/xpert-project/:projectId/pipelines/native-model-budget/increases` with
`instanceId`, a unique `requestId`, the current `expectedRevision`, the new absolute
`maxTokens` ceiling and a `reason`. The host records an append-only audit event;
the original policy, past usage, held reservations, call limit, candidate and human
approval remain intact. Exact request replays are idempotent; concurrent or changed
replays and reductions are rejected. An increase does not restart work: use the
existing native technical retry after inspecting the failure. This management API
is not available to Agent tools or delegated credentials; there is no budget editor
in the Pipeline View yet.

The current `instance_native_llm` budget covers host model calls whose persisted
execution ancestry reaches a native Pipeline operation. CLI proxy usage is separate.
Task-completion coordinator continuations with no persisted parent are also outside
this ledger today. Consequently this ceiling is not a project-wide total token or
cost cap. Full delegated-budget attribution remains a known infrastructure gap.

The host must provide `platform.project.task_acceptance` with independent execution
review support before delivery can run. Fixture tests, plugin loading and real
cross-instance delivery are distinct verification layers.
