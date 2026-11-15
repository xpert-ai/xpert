# Independent execution acceptance

Share the same task requirements, scope and applicable skills with the developer
and reviewer. Keep the original user objective visible, but judge a child task
against its own responsibilities. Optional improvements are not blocking defects.
The final feature needs a separate end-user acceptance pass across the integrated
result, even when individual implementation tasks have already been accepted.
For a Coding task that already owns the whole feature, include that integrated
pass in its independent review; it need not become another implementation task.
Pin the final submitted candidate after the developer's deployment/self-repair
loop. Reviewer feedback starts a new implementation/review round; it does not
authorize the reviewer to silently patch the candidate.

## Assign and launch

New delivery stages use a summary task with an implementation child and independent
review children. The summary coordinates and is never sent to Coding CLI. At review
dispatch set `reviewAsSubtask: true` alongside the implementation `taskId` and current
revision. The host creates a pinned review sibling under the summary (or a child of
a standalone implementation task), and returns its `projectTaskId`. Read that task
for the report. Repeating this dispatch for the same candidate reuses that review
task; each attempt remains separately recorded. New candidate implementations get
new review tasks. Do not put the implementation task in the review's predecessorIds:
its candidate is ready before formal delivery acceptance, which is not a dependency
on the implementation task being marked done.

For grouped delivery, read the summary with `project_get_task` and use its
`decisionOptions[].decisionRef` after reading the referenced independent report.
Call `project_decide_task` with that reference, `outcome` and concise `rationale`;
`checks` is optional. Do not assemble IDs, versions, digests or evidence arrays.
The host binds the observed candidate and review; a changed reference requires a
fresh read and assessment, not a new coding execution. A summary decision also
records the selected implementation child's decision; do not decide both separately.
Acceptance already records completion; do not follow it with status or checklist
completion updates merely to mark it done.
For standalone tasks, read and decide the implementation task. Do not manufacture a second task per command,
report edit or temporary runtime failure. A delivered review report
completes the review work item; the main Assistant decides the next action. Review
tasks cannot implement fixes or accept themselves. A report-only recovery must reuse
attributable evidence and state which checks were preserved, not claim new execution.

Inspect the advertised schemas. A Project implementation dispatch can assign a
reviewer through `purpose`:

```json
{ "type": "implementation", "reviewer": { "bindingId": "<authorized-runtime-binding-id>", "mode": "execution" } }
```

After the implementation result arrives, read `project_get_task`. Dispatch a
review of the latest implementation with `purpose.type = review`,
`mode = execution`, `implementationExecutionId`, `implementationInvocationId`,
`specificationDigest` and the exact implementation `evidence` references. Use the
assigned reviewer binding. Supply `candidatePaths`: Project-relative source or
artifact files/directories that contain the candidate and its build/test inputs.
Do not select the whole Project, dependencies, sessions or unrelated secrets.
Place packed acceptance artifacts under a normal directory such as `artifacts/`;
selections inside `dist`, `coverage`, `.cache` or `node_modules` are rejected.

The host creates a separate review workspace with `review-context.json`,
`candidate/` and `output/`. The context records original Project location and a
snapshot digest. Dependencies and generated `dist`, coverage and cache directories
are excluded; include the packed artifact explicitly when it is the acceptance
subject. The reviewer reads skills/project context from the original Project.
The host does not permit candidate edits to silently become an accepted result.

The reviewer may inspect, test, build, install the fixed candidate into the
authorized development instance and make real application calls. Treat `candidate/`
as read-only evidence. Copy it to `output/work/` before dependency installation,
tests or builds, preserving source/build inputs and recording their correspondence
to the snapshot. Keep new tests, caches, generated archives and logs under `output/`;
never overwrite a pinned candidate archive. Copies may retain the snapshot's
read-only file modes: make only the disposable working copy user-writable when
a build or packaging command needs to write there, and keep regenerated archives
separate from the pinned archive. Do not repair business code in either
the candidate or working copy while reviewing. Preserve the candidate files; a
changed candidate requires a new implementation/review round. Deliver selected
evidence as exact files relative to the review workspace, for example
`output/report.md`, not directories or paths in the original Project directory.

Omitting review mode selects evidence-only mode with tools disabled.
It assesses supplied text and cannot claim to have executed tests.

## Reports and decisions

Return an ordinary Markdown report. If dispatch selects `delivery.reportPath`, write
UTF-8 Markdown to that exact path relative to the review workspace. Otherwise use
the final reply. There is no required heading order, verdict field, JSON envelope,
finding identifier or author-calculated digest.

Explain what was actually checked, commands/actions and observed behavior, evidence
paths, unresolved defects and limitations. State explicitly when installation or
live invocation was not performed. Do not present inspection as execution. Keep
reports and logs free of credentials. A short report with precise evidence is
better than repeatedly reformatting a successful run.

The host records execution/candidate identity, report revision and digest. The
main Assistant reads the report, assesses it against the original requirements,
and records accept or rework with `project_decide_task`. Report presence, CLI exit
success and words such as "passed" do not decide acceptance.

For rework, use the same `decisionRef` with outcome `rework`, then dispatch an
implementation with `purpose.rework: {reviewExecutionId, feedback}`. Write concrete
natural-language changes in `feedback`; do not invent finding IDs. The platform
supplies the exact report bound to the decision. Preserve the assigned reviewer.
After repairs, a fresh independent review must assess the new candidate.

## Recover delivery without repeating completed work

Use `project_get_task` to distinguish execution failure from report or artifact
transfer failure. If the execution has finished and only delivery failed, call
`project_recover_task_delivery` with its task ID, execution ID and current invocation
revision. It re-reads the originally selected report and/or collects deliverables;
it does not launch Coding CLI, reinstall the plugin or rerun tests.

If artifact names were unknown at dispatch, select their exact relative paths from
the Markdown report in the recovery call. A previously fixed selection cannot be
changed. No wildcards or directory scans are permitted. Successful report delivery
is preserved when only artifact export needs retrying. Recovery creates a new
result revision and records its history; use that revision for subsequent review
and acceptance. It does not accept the task.

If the report file never existed or the workspace is gone, recovery cannot invent
it. The coordinator may request a focused report-only task based on retained
results. That task must identify which checks were previously executed and which
are missing; it must not claim a new deployment or test run.
