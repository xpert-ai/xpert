# Standalone MCP files and protocol acceptance

Status: the host PR includes personal files, queued execution authorization,
legacy confirmation compatibility, and optional Resource query handling.
Explicit-model standalone speech-to-text changes have been removed. Cut uses its
existing Sandbox Whisper path; no standalone model-binding API is included.

## Configuration

Deploy compatible API and queue workers and apply the nullable
`mcp_publication.runtime` JSON column through the normal schema deployment flow.
Existing publications do not acquire a binding automatically. Configure:

```json
{ "runtime": { "files": { "type": "user" } } }
```

Only personal-file binding is supported here. A `runtime.transcription` field is
rejected. The existing Assistant-based speech-to-text API is unchanged.

The file owner is the authenticated user, never a tool argument or Cut project
ID. The existing users catalog is shared with that user's other authorized file
operations; it is not a separate filesystem sandbox per publication.

## File transfer and execution

- POST `/api/mcp/p/:slug/files`: multipart `file`, non-empty, at most 256 MiB.
- GET `/api/mcp/p/:slug/files?filePath=...`: authorized relative file reference.
- Use the publication credential with `files:write` or `files:read` respectively.
- Upload authorization runs before buffering the request body.
- Cross-user or foreign catalog references must fail.
- Queued MCP calls retain the original actor and file configuration. Workers
  recheck publication, capability policy and membership before execution.
- A policy tightened from allow to confirm cannot execute an unapproved queued
  call. Runtime configuration changes reject the queued call instead of silently
  changing its storage binding.
- Legacy interactive sessions are process-local, bounded and principal-bound.
  Resumed calls revalidate access and reuse the same invocation audit. Restart or
  unknown session IDs require initialization; shared Redis alone cannot restore
  SDK connection state.
- Resource queries accept omitted optional parameters and preserve requested URIs.

## Companion plugin and runtime

Cut changes belong to xpert-plugins and are not included here. Publish compatible
contracts/plugin-sdk before updating the companion plugin dependencies. The companion build uses the SDK ResourceReadContext for resource reads and
restores the host-bound file scope in transcription and export jobs.

For the paired rendering configuration, Cut Action 1.1.6 selects the existing
`browser/video-playwright-1.61/v1` profile: runtime 1.2.1, Node 22.17.1,
Playwright 1.61.0 and FFmpeg 6.1. The profile has a 30-minute timeout and 35-minute
hard deadline; Cut retains its 15-minute render and 16-minute sandbox budgets.
Provision the corresponding worker image before using that companion artifact.

## Historical isolated acceptance: 2026-09-15

The paired local host/Cut deployment on API 3301 used isolated PostgreSQL and
Redis. Existing services on 3000 and 4200 were not restarted or replaced.
A native Codex task created a new project, imported a 342.65-second recording,
removed eight authorized ranges and exported once through MCP. HTTP handled
upload/download; local FFmpeg only probed and decoded the result.

Result: 180 seconds, 5400 frames, 30 fps, 1156x720, no audio, 28,125,231 bytes.
Action 1.1.6 succeeded on attempt 1 in approximately 88 seconds. Full decode passed
and the source hash was unchanged. Output SHA256:
`7ebcf6bffb8759a892d93ca8a9cfe590f4613a44cf7b29c884103657d87cfb3f`.
The download matched the server export row checksum. MCP did not expose checksum,
so the comparison used read-only database evidence.

This historical run predates the develop replay and removal of the deferred
speech API. It does not validate platform transcription or prove a fresh E2E of
the reduced PR. Full manual playback/color fidelity, a render longer than six
minutes, and multi-instance operation remain unverified. Source color metadata
was bt709 and output metadata smpte170m; quantitative color equivalence was not
verified.

## Target-branch validation boundary

The patch is based on develop e31e30247a with unrelated release commits excluded.
Translation conflicts retain both develop knowledge messages and MCP messages.
The unchanged XpertToolsetService at xpert-toolset.service.ts:53 raises TS2589 in
the normal Tool Runtime test suite with the current installed dependencies. A
clean archive of the same develop commit reproduced the error. Temporary
suppression of diagnostics can validate behavior but does not resolve this
baseline type-check failure. Repository test configuration remains unchanged.

After removing explicit-model speech changes, 8 suites / 89 tests passed.
All 16 Tool Runtime behavior tests also passed with TypeScript diagnostics
disabled only in a temporary test-run configuration; the baseline type error
remains unresolved.

## Sandbox subtitle acceptance: 2026-09-15

The narrowed local deployment on API 3301 completed transcription without a mode
argument (default `sandbox_whisper`, Xenova/whisper-tiny), caption draft creation
and commit, MP4 export, and authenticated HTTP download. The 45-second English
speech fixture produced seven timestamped segments. Export succeeded and returned
1,695,043 bytes; a sampled frame contained the expected burned-in subtitle. The
user subsequently confirmed the small-model transcription → subtitles → MP4
download workflow works. No platform model binding was required.

This verifies the workflow, not perfect transcription accuracy: the small model
collapsed a repeated phrase and added a short spurious word near silence.
Multi-instance behavior and exports exceeding six minutes remain unverified.

Resource reads now receive `ResourceReadContext extends ToolExecutionContext`
with a required `resourceUri`; tools, prompts and completions retain the base
context. Cut returns the exact requested URI, including optional query arguments.
