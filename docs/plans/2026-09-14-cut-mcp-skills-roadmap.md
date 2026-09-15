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

## Transcription boundary

Standalone Cut uses its existing Sandbox Whisper small model. The narrowed local
workflow passed transcription, captions, MP4 export and download; it needs no
Assistant or external model provider. Explicit-model standalone platform APIs
have been removed from local host and Cut changes and are not part of this PR.
The independent SiliconFlow adapter work remains outside this delivery.
Do not configure `runtime.transcription` on the host delivered by this PR.

## Batch 2: packaged workflows

Implemented in the companion Cut plugin on 2026-09-15: the existing
`cut-agent-skill` remains the basics/authorization entry, with four focused
Skills for speech editing, captions, verification and export. The Assistant
binds all five; the four existing MCP Prompts include the same packaged base
and task workflow, so standalone clients do not depend on an Assistant install.
Content review reuses prior approval for identical edits while platform
confirmation, permissions and revision checks remain authoritative.

See [Batch 2 acceptance](./2026-09-15-cut-mcp-batch2-acceptance.md) for the
scope, integration checks and live behavior scenarios. This is an instruction
and packaging delivery, not proof of model behavior in a target deployment.

## Later batches

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
