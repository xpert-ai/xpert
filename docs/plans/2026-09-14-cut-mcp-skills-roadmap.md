# Cut MCP delivery roadmap

## Current PR scope

Deliver standalone personal-file access and protocol reliability:

1. Shared file execution context and exact Resource URI contracts.
2. Publication personal-file binding, authenticated upload/download, worker
   identity restoration and queued permission revalidation.
3. Legacy interactive confirmation sessions and optional Resource query matching.
4. Configuration and acceptance documentation.

Native Project/Assistant execution remains supported. Cut business project IDs
must not be used as platform Assistant IDs or file-volume owners.

## Deferred local work

Explicit-model platform transcription is removed from this PR and remains only
in the original local xpert and xpert-plugins working changes. Its future delivery
must coordinate contracts, SDK, host service permissions and the companion Cut
plugin. It requires real model-backed MCP acceptance before being called complete.
Do not configure `runtime.transcription` on the host delivered by this PR.

## Later batches

- Batch 2: organize basics, speech-editing, caption, verification and export
  Skills. Content review should reuse existing user approval for the same edits.
- Batch 3: map Skills to Tool Profiles and bind only relevant tools per round.
  Validate the actual model request, profile transitions and pending task needs.
- Batch 4: use real evaluations to decide which tools to merge, remove or hide.
  Do not remove tools merely to meet a count target.

MCP Tasks describe request lifecycle; they do not automatically increase sandbox
budgets or connect a plugin's independently queued media job to task completion.
That integration is separate future work.

## Acceptance

See [the file and protocol acceptance runbook](./2026-09-14-cut-mcp-batch1-acceptance.md)
for configuration, historical paired clipping results, dependency sequencing,
baseline test limitations and remaining live checks.
