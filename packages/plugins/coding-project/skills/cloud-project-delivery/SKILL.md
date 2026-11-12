---
name: cloud-project-delivery
description: Deliver a software feature end to end through Xpert Project tasks and cloud Computer coding runtimes. Use when an Assistant owns implementation, deployment to an authorized development instance, testing and acceptance from one user request; not for review-only or standalone diagnostic requests.
---

# Cloud Project Delivery

The initial feature request is the objective. The coordinating Assistant owns the
delivery loop until the requested behavior is verified or a concrete blocker is
recorded. Do not require a user to prompt each implementation, deployment or test
phase. Infer reasonable acceptance cases from the feature; ask only for a missing
decision or authority that materially prevents progress.

## Ownership and scope

- The coordinator defines acceptance outcomes, creates and delegates Project
  tasks, manages long-lived services, reads evidence, requests rework and accepts
  results. Choose the decomposition from the work, resource limits and receipts;
  there is no fixed number of tasks or mandatory task-name sequence.
- The selected cloud Coding Runtime performs project code edits, environment
  preparation, builds, tests, packaging, development deployment, live checks and
  repairs. Include these outcomes in delegated tasks. Do not do those operations
  in the coordinator's Shell and then attribute them to the CLI.
- Give a Coding task a deliverable increment, including its development deployment,
  self-tests and ordinary repairs. A small plugin can be one Coding task followed
  by independent execution review. The developer may fix integration defects,
  restore the authorized test environment and submit a new version within that
  task; the reviewer assesses the final candidate, not an intermediate package.
- Assign independent execution acceptance to implementation tasks. A fresh
  reviewer session may use the same CLI/model, but performs its own checks and
  reports findings; the coordinator decides acceptance or scoped rework. Read
  [independent acceptance](references/independent-acceptance.md) for the supported
  task fields and feedback loop. Evidence-only review cannot replace live checks.
- The platform supplies the actual Computer, executor authorization, credentials,
  resource limits and durable execution/continuation. Skills describe procedures;
  they do not create permissions or replace missing capabilities.
- Use the authorized development instance. For a full local delivery request,
  starting its stack, initializing its isolated local account and testing there
  are part of that scope. Do not ask for the same authority at each step. Publishing
  externally or changing the coordinator's own platform is a separate target.
- When the user designates the Computer's test instance as disposable, carry that
  authority into Coding tasks: the executor may disable, uninstall or replace old
  test plugins that obstruct delivery. Preserve their coexistence only when it is
  an actual requirement. Record environment changes and test the final installed
  candidate; routine cleanup needs no additional user prompt.

## Prepare discoverable context

Read relevant selected skills using the advertised skill tools. Give delegated
tasks the exact accessible skill paths or runtime-supported skill references and
their version/digest. Verify that the CLI can read them; a skill installed on the
coordinator's desktop is not automatically present in the Computer.

Keep technical knowledge in the applicable skills. For Xpert plugins use
`xpert-plugin-development`; for a complete Xpert instance inside an existing
unprivileged Computer use `xpert-platform-local-environment` process mode.
The image's `cloud-coding` skill covers CLI and Computer execution contracts.
For other programs select their own environment and delivery references.

Give the executor a direct link to [Coding task execution](references/coding-task-execution.md)
in its startup brief, alongside the objective, authorized target and deliverables.
Coordinator planning instructions alone do not tell a CLI how to own its repair loop.

Inspect the current project, allowed workspace, runtime catalog and available
capacity. Preserve existing files and use an independent directory for a new
deliverable. Missing capacity, credentials or service control is a specific
platform prerequisite, not a reason to invent a successful deployment. Do not
modify container privileges, host resources or approval policy from the guest.

## Delegate and continue

Use the current tool schemas; the Project Tasks mappings are:

| Purpose | Tool / contract |
| --- | --- |
| Discover executors | `project_list_task_runtimes`; choose an authorized compatible binding |
| Persist work | Project task creation tools with objective, requirements and deliverables |
| Dependencies | `project_update_task_plan` using current revision and predecessor IDs |
| Launch | `project_dispatch_task` with latest revision and the selected binding |
| Observe | `project_get_task`; inspect actual attempts, invocation result and artifacts |
| Accept / rework | `project_decide_task` with current specification digest, implementation execution, evidence revision, checks and rationale |

Confirm these names and fields against the advertised schemas. A task dependency
or a todo item does not launch an executor. The Runtime already launches its coding
CLI: describe the work, not another `codex` invocation inside that task. Specify
exact project-relative `delivery.paths` for known outputs. Requirements should
name observable results and preserve scope, not prescribe every Shell command.

Keep each task independently verifiable. Split large work by independently useful
increments, genuine dependencies, different authority or execution budgets.
Test pure domain behavior before integration within the task when useful; this
does not require separate implementation, packaging, deployment and repair tasks.
For a small feature with a supplied starter, put a working business implementation
and its tests before deployment investigation in the task plan. Environment startup
may proceed alongside coding. Inspecting every installed plugin or understanding
the platform's internals is not a prerequisite for writing code against a documented
interface; investigate those details when a concrete build or live check needs them.
Separate uncertain research when its result is needed to scope implementation.
Do not add new product requirements merely to make a
longer checklist; use the host's existing validation and error conventions.
Provide a compact outcome specification and relevant skill references instead
of copying whole skills into the task prompt. Prefer existing machine receipts,
test logs and a short result summary over a second narrative report.

Stop a task when its specified outcomes and affected checks pass. Do not repeatedly
polish already accepted behavior, rebuild unchanged dependencies, or reread every
source file before returning. Capture command output once while preserving the
real exit code; the exit status of a trailing `tail` command is not test evidence.
Reuse an authorized working example or build scaffold after checking compatibility.
Record what changed and its evidence rather than reconstructing a new framework.

For each failure, keep a short hypothesis and the next falsifying check. Once the
evidence identifies a scoped defect, implement the repair and run its affected
check. Do not repeat an unchanged command with the same output unless an external
state change is expected. If several inspections add no information, return the
specific unresolved question and existing evidence for a narrower repair task;
do not consume the remaining execution budget repeating the investigation.

Keep the final structured summary brief: outcome, evidence paths, artifact digest
and unresolved issues. Use changes/tests/file items for details. Full implementation
means complete files in the workspace, not full source pasted into the response;
include verbatim source only when explicitly requested. Return promptly once the
task's implementation, development deployment and self-tests are ready for review.
An explicitly narrower task retains its scope; it cannot establish full delivery.

Dispatch returns task/attempt/invocation identities, not completion. Use the
platform's durable completion delivery or supported bounded waiting mechanism.
On a completion event, reload persisted requirements and results, assess the
evidence and continue the next appropriate task without another user message.
When a Project dispatch registers durable result delivery to this conversation,
finish independent coordination and end the current turn with an interim status;
the result event resumes coordination. Do not keep that turn occupied with Shell
sleep loops, process searches or repeated file checks. If the executor contract
does not register continuation, use its supported bounded wait such as
`task_status`, not a fabricated callback. A final deliverable reply must not leave
required stages waiting for “continue”.
Do not promise background progress without a live execution or registered
continuation. Do not repeatedly poll unchanged status or keep a model running
merely to wait for a build.

For a suspected stalled attempt, use native task status and cancellation controls.
Cancellation is a request until termination is confirmed. Preserve the attempt
and narrow the rework task using its concrete failure or missing deliverable;
do not silently relaunch concurrent writers or implement the missing code yourself.

Persistent development services belong to `sandbox_service_start`, not to a
background child of a finite CLI task. The CLI may prepare the environment and
return the required foreground service command; the coordinator starts that
authorized service and delegates dependent work. Save its service receipt.

## Recovery and evidence

An uncertain dispatch outcome requires reading the existing attempt before a
new launch. On failure inspect the concrete diagnostic and current files, then
delegate scoped repair with preserved evidence. Do not erase failed attempts.
Unknown execution state requires resolving ownership and termination before
another mutating attempt. Approval denial is not a retry instruction.

Task acceptance requires evidence for its current specification. The complete
feature needs source, relevant test results, packaged artifact identity, install
and loaded-version receipts where applicable, and real behavior in the target
application. CLI exit 0, a written report, a healthy API, or successful import of
a pure function does not prove the installed feature works. Bind every receipt
to its task/invocation and target; keep secrets out of reports.

For an Xpert plugin, deployment and live verification are completion requirements
of the full delivery task even if the initial user input only describes its
function. Handle `pending_restart` in the isolated instance; test the loaded
plugin through the real host capability. Ask the CLI to repair failed cases and
rerun affected checks. The coordinator reviews the receipts and records the
formal acceptance decision; it does not ask the user to perform acceptance.

Keep ordinary repair details in task evidence. User-facing updates should concern
meaningful outcomes or blockers requiring a user decision. The coordinator handles
task/budget coordination internally; do not ask the user to guide routine recovery.

Report the resulting feature, verified target and behavior, artifacts and any
remaining failures. Distinguish generated, tested, installed, loaded and accepted.
If an outside operator supplies phase instructions or substitutes implementation,
deployment or tests, retain that attribution. Such a run is not evidence of
single-request autonomous delivery; repair the capability and use a fresh trial.
