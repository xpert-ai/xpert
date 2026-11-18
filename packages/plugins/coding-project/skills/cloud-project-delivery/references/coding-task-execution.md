# Owning a Coding task through self-verification

Coordinator reference for writing a delegated task brief. Include its applicable
requirements in that brief; require the CLI to read this file only when the file
has actually been supplied in its prepared context.

Use the assigned objective, workspace, authorized development target and selected
skills. Implement the deliverable, build/package it, deploy to that target and
exercise its actual application surface before submitting it for review. A task
explicitly scoped to research or a component keeps that narrower responsibility.

## Reach a working candidate early

For a small feature with a supplied starter or working example, use it as the
initial integration pattern. Read the feature's input/output contract and the files
you need to change, implement the smallest complete requested behavior, and run its
focused tests. Let compilation and test failures identify missing knowledge. A
documented interface does not require a tour of its implementation before use.

Keep environment startup separate from this first coding loop when the feature's
pure logic can be tested without a running server. After those tests pass, package
the candidate and exercise it through the real application. Read a framework
implementation only to answer a specific unresolved question from an actual failing
check or a capability the feature needs. Record that question and result instead
of expanding the investigation into adjacent types, limits and lifecycle code.

If investigation keeps growing without producing changed business code or an
executed check, narrow the next action to a runnable experiment using the supplied
pattern. When that experiment still cannot proceed, return its concrete failure
and the unresolved interface question to the coordinator for scoped repair. Keep
the requested behavior and the final deployment/review obligations intact.

## Repair and submit

Keep one useful execution active through slow installation, compilation and live
checks. A pending shell/readiness response is an observation, not proof of failure.
Check the same process and recent log progress, then continue that operation.
Do not stop a progressing build merely to return an environment-only report when
implementation, deployment and testing are still required. While setup runs,
implement or test independent parts when they do not need the unfinished build.
Diagnose a concrete failure before restarting. Return a checkpoint only when a
specific unresolved dependency or missing authority prevents further progress.

Reuse the selected checkout, verified dependencies, build outputs and exact candidate
when resuming. Start only services needed by the requested check. A task limited to
release materials or reports should reuse existing evidence and perform only the
missing checks; it does not require a fresh full-stack build. A live deployment or
independent execution review still needs actual runtime evidence for that candidate.

On a technical retry, first read the previous result and inspect its named paths.
An interrupted model request does not imply an empty workspace. Continue the
remaining steps in that checkout; avoid a second extraction or a new environment
directory unless the existing one is demonstrably unusable. Read host-prepared
identity/template files directly when supplied; do not retype their identifiers
from a coordinating message into delivery metadata.

Ordinary coding, packaging, deployment and environment failures belong to this
execution. Keep a short hypothesis and perform the next discriminating check.
Once the defect is identified, repair it and rerun the affected checks. Avoid
repeated source exploration with no new information. Return a concrete unresolved
question and evidence to the coordinator when the available capability, scope or
remaining budget prevents progress; do not ask the user for phase instructions.

Use the test-instance authority in the task brief. In an explicitly disposable
Computer development instance, you may disable, uninstall or replace conflicting
old test plugins without asking the user. Keeping every historical plugin installed
is not an implicit acceptance requirement. Record the affected packages, versions
and reason, preserve source/artifacts and failed-attempt evidence, then verify the
new plugin in the resulting instance. Do not remove a dependency that the requested
feature actually needs or claim coexistence if you tested a reduced plugin set.

Discover supported recovery before changing instance state. For an exclusive
process-mode Xpert instance, use a checkpoint when the selected checkout supports
it. A missing checkpoint does not prohibit an authorized uninstall or creating a
fresh project-owned test instance. Shared instances retain their narrower scope;
use supported targeted rollback and preserve other users' data.

Within the assigned scope, an integration failure may require editing your own
code, producing a new package version/digest and deploying again. Record which
candidate each test and installation used. Do not overwrite an archive already
referenced by evidence or present a previous candidate's success as current.

Submit the final source, exact artifact, deployment/loaded-version receipts,
meaningful self-test results and remaining limitations. Environment health alone
is not feature acceptance. The independent reviewer checks this final candidate;
it does not repair it. After review feedback, the coordinator owns formal rework
and the next review round. Do not accept your own task.

## Project knowledge and source ownership

When startup provides a host-prepared task context, read that manifest and its
Project instruction/skill copies first. Resolve their paths from the stated
original Project directory, including from a separate review workspace. Follow
relative references within each complete skill package. For cross-skill references,
use the installed package path from the manifest rather than assuming siblings.
Absent domain knowledge is feedback to the coordinator for Project installation;
other Projects and old workspace notes are not implicit dependencies.

Use the current Project's selected checkout, commit and environment receipt.
Preserve local changes. On continuation reuse its data and caches; on a new
Project create its own mutable instance. Read the selected checkout's own
instructions and inspect its startup command capabilities. A historical untracked
script does not define the current tool contract. Coding CLI owns services it
starts; their lifetime may end with the task. Record reproducible startup details
for the independent reviewer without asking the host to relay service commands.

## Keep evidence readable

Return a short result with the candidate identity, outcome, checks performed,
evidence paths and remaining issues. Keep raw request/response dumps and build
logs in separate files instead of appending them to the report read by the
coordinator on every turn. Preserve those files for independent inspection.
A short report is not a substitute for real testing. Coordinators can use
`project_read_task_result` when `project_get_task` returns an explicit excerpt;
read the relevant pages and independent findings before recording acceptance.
