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

For grouped delivery, make the formal decision on the summary using its latest
revision and the child execution evidence. For legacy ungrouped tasks, continue
deciding the implementation task. Do not manufacture a second task per command,
report edit or temporary runtime failure. A valid negative or indeterminate verdict
completes the review work item; the main Assistant decides the next action. Review
tasks cannot implement fixes or accept themselves. A report-only recovery must reuse
attributable evidence and state which checks were preserved, not claim new execution.

Inspect the advertised schemas. A Project implementation dispatch can assign a
reviewer through `purpose`:

```json
{"type":"implementation","reviewer":{"bindingId":"<authorized-runtime-binding-id>","mode":"execution"}}
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
`output/report.json`, not directories or paths in the original Project directory.

Omitting review mode preserves the older evidence-only mode with tools disabled.
It assesses supplied text and cannot claim to have executed tests.

## Read feedback and decide

Execution review produces a version 2 report with verdict
`pass`, `changes_required` or `indeterminate`, actual checks, stable finding IDs,
and limitations. Use the host-provided response envelope and exact subject IDs.
The host includes recorded prior execution-review findings for a reworked
implementation or repeated review. Read them alongside the current implementation
dispositions, preserve IDs for the same issue and independently check the fix.
Do not replace the report with prose or claim tests were executed when only read.

### Keep the review handoff small

For a small task, aim for roughly 500 words of assessment across the summary,
checks, findings and limitations, excluding the host's fixed subject/evidence
references. This is guidance, not an acceptance limit: retain material findings
and limitations when more detail is needed. Give each check its outcome, a short
actual result and an evidence path; keep full commands, output and detailed
analysis in files. Do not repeat the same narrative in summary, checks and items.

Use the current host-provided envelope and a JSON encoder to serialize it once.
The skill's [review-result.py](../scripts/review-result.py) handles that encoding:
write your version 2 report as ordinary JSON in `output/report.json`, preserving
the host's exact subject and evidence references. On current hosts, load
`review-context.json` and copy its `subject` object's `implementationInvocationId`,
`specificationDigest` and `evidence` into your report programmatically. Do not retype
UUIDs or reorder evidence. These fields identify the candidate; the checks,
findings and verdict remain your independent assessment. Then run from the review workspace:

```bash
python3 <skill-dir>/scripts/review-result.py --report output/report.json \
  --file output/logs/commands.log --output output/result-envelope.json
```

When the runtime explicitly advertises **result-file submission v1**, add
`--submission file`. The helper emits a small `xpert-task-result-file` reference
with the output path and SHA-256; return that reference as your final response
without copying the report JSON. The runtime reads and validates the exact bytes
before checkpointing the result. Writing a file alone is not submission. Older
hosts use the default inline envelope; do not send them a file reference.

Use `--file` only for the actual requested deliverables; omit it for no file
delivery. The helper preserves every report field. It preflights versioned report/check/finding field names,
serialization, selected file existence, and exact subject identity when the host
context supplies it. Missing or extra fields fail locally with their paths; the
helper never removes fields or changes your verdict. Put contextual notes in the
supported assessment text fields. This is not full schema validation or assessment
of the evidence: the host remains authoritative for both protocol and acceptance.
Use the emitted result directly instead of recreating a report builder or validator.
Normal JSON escaping and Unicode are valid; do not invent ASCII-only rules or
repeatedly regenerate a valid report to simplify escaping. One format check is
enough after the final content change. When the findings are recorded, the format
check passes and the selected files exist, return the emitted submission immediately.
Do not rewrite the generator or rerun unchanged business tests for wording alone.

The coordinator should refer to the host contract and specific diagnostics
instead of copying a large replacement schema into each dispatch. Read the
invocation's actual error before diagnosing a failed handoff: missing output may
be a consequence of a model or runtime failure. Reuse attributable preserved
results for a delivery-only retry when the candidate and relevant environment
are unchanged; do not relabel another attempt's checks as newly executed.

The coordinator owns the next decision:

- Reproducible defects: record `project_decide_task` rework with the review ID,
  then dispatch a new implementation with the same reviewer and
  `rework: {reviewExecutionId, findingIds}`. The host passes the selected recorded
  findings to the developer. Ask for each finding's disposition and affected tests.
  If that rework CLI fails or is cancelled, first confirm termination, then retry
  with the same feedback reference and reviewer. A successful new implementation
  requires its own new review; an old failed review cannot accept it.
- Environment failures: repair or delegate environment work, then review again;
  do not ask the developer to change unrelated application code.
- Ambiguity or coverage gaps: clarify the existing requirement or request more
  checks. Ask the user only for a material missing business decision.
- Suggestions: record why they are accepted, deferred or outside scope.
- Pass: inspect coverage and limitations, then formally accept with the current
  implementation evidence and `reviewExecutionId`. Runtime success alone is not
  acceptance, and a reviewer cannot make the coordinator's decision.

Keep feedback history. Reuse an existing finding ID for the same issue, and carry
resolved findings forward without reopening them absent new evidence. Repeated
unchanged disagreements need coordinator diagnosis, not another identical retry.
Respect the execution/overall budget and preserve a concrete blocker when progress
cannot continue. Cancellation must be confirmed before launching another writer.

Both implementation and review completion resume the coordinating conversation
through durable result delivery. End an interim coordination turn after dispatch;
do not ask the user to say “continue”, and do not wait in a Shell sleep loop.
