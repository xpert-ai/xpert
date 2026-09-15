# Cut Batch 2: Skills and workflow acceptance

## Ownership and scope

- `xpert-plugins/xpertai/apps/cut` owns the five packaged Skills, Assistant
  template dependencies, marketplace entries and MCP Prompt content.
- `xpert` continues to provide generic skill installation, MCP Prompts,
  authorization, file binding and revision-safe tool execution. Batch 2 adds
  this acceptance contract and updates the roadmap; no host runtime or SDK
  change is needed for plugin-owned instructions.
- Existing MCP Prompt names/arguments, tools and Resource contracts are retained.
  Tool Profiles and dynamic tool binding remain Batch 3. Model quality scoring
  and tool consolidation remain Batch 4.

## Packaged workflows

| Skill                | Responsibility                                                  | Existing MCP Prompt               |
| -------------------- | --------------------------------------------------------------- | --------------------------------- |
| `cut-agent-skill`    | Basics, project/file identity, revisions, content authorization | Included in every workflow Prompt |
| `cut-speech-editing` | Evidence-backed cleanup, exact cuts, proposal application       | `cut_plan_rough_cut`              |
| `cut-captions`       | Reuse/start transcription, retime/correct/translate/commit cues | `cut_translate_captions`          |
| `cut-verification`   | Inspect proposals, edits, captions and exported output          | `cut_review_edit_proposal`        |
| `cut-export`         | Preflight, background jobs, variants and file delivery          | `cut_prepare_export`              |

The Assistant template binds all five components. The old `cut-agent-skill`
component key remains valid. Existing installed templates/skills must be updated
through the normal plugin/resource flow; editing the source checkout alone does
not upgrade a running Assistant. Individual specialist skill installs also need
`cut-agent-skill` for shared authorization and identity rules.

MCP `prompts/get` returns the bundled base and selected workflow directly. The
client does not need local access to the plugin directory. Prompt names and
arguments stay stable; workflow instructions are English and the prompt asks
for the requested response language, retaining Chinese and English lead-ins.
Further stages can be obtained through the other existing workflow Prompts.

## Content approval versus platform authorization

The agent checks whether an instruction covers the same project, exact content
and operation. Existing approval permits those edits without another content
confirmation. Broad intent does not preapprove newly chosen destructive cuts.
Explicit preview/wait instructions, rejected proposals and changed effects still
require the appropriate user decision. On a revision conflict, refresh and
compare before deciding whether approval still applies; never silently rebase.

This changes instructions, not authorization state. MCP policy `confirm`,
elicitation, access checks, proposal state and CAS still run normally. A chat
message is not a reusable platform approval token.

## Live behavior scenarios

These are target-client acceptance cases, not automated model evaluations.

| Request / starting state                                              | Expected behavior                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete exactly specified timeline ranges and export                   | Inspect and validate, reuse the instruction as content approval, preserve A/V sync, export and deliver; no second content-approval question |
| Make an interview shorter without specifying cuts                     | Inspect evidence, present concrete proposed cuts and unresolved choices before destructive application                                      |
| Show the proposal first and wait                                      | Return the reviewable proposal without applying or exporting                                                                                |
| Apply previously approved cuts after a project revision changed       | Refresh, compare affected content, preserve concurrent work; do not silently rebase a stale proposal                                        |
| Proposal rejected or scope expanded                                   | Do not treat previous approval as permission for the new work                                                                               |
| Same edit is allowed in conversation but MCP policy is confirm        | Follow platform elicitation; a denied confirmation produces no write                                                                        |
| Standalone transcription and subtitles, no Assistant/provider binding | Use sandbox_whisper, poll its plugin job, inspect and commit within the requested scope; do not request runtime.transcription               |
| Same transcription/render job is still running                        | Resume polling the existing job instead of submitting a duplicate                                                                           |
| Cleanup then cover then bilingual subtitles                           | Preserve source-to-timeline cut mapping and cover offset; translate every cue and commit the language drafts atomically                     |
| Export submitted but plugin job still queued                          | Report pending; MCP Task success is not render completion                                                                                   |
| Render succeeded but download failed                                  | Keep the export ID, report the download boundary, do not re-render                                                                          |

## Validation boundary

Automated checks cover skill/template/manifest consistency, loading packaged
workflow text into all four real MCP Prompt definitions, response-language
lead-ins, and omission of unrelated export instructions from caption prompts.
The package gate checks that every required Skill is in the actual npm pack
file list, not merely present in the source directory.

2026-09-15 local validation:

- Nx Cut build passed.
- Nx Cut test passed: 36 suites / 165 tests, server/test and remote component
  type checks, remote bundle consistency, Sandbox Action build/verification.
- Package prepack passed with all five Skill paths in the npm file list.
- `plugin-dev-harness` loaded the built plugin and completed bootstrap,
  destroy and stop with its standard infrastructure mocks.
- Built `dist/lib/cut-skills.js` resolved all five packaged workflows.
- Both repository diffs passed `git diff --check`.

The existing pnpm setup attempted an automatic install before the first test
and hit a registry certificate error. That task-owned install was stopped;
subsequent Nx commands used `pnpm_config_verify_deps_before_run=false` with
existing local dependencies, without changing repository package-manager config.
Build-generated Workbench JS/CSS changes were excluded because Batch 2 does not
change UI source.

Real-client behavior, content approval reuse by the model,
updated installed templates and live tool confirmation must still be checked in
the intended deployment. Batch 1 long-export, multi-instance and playback/color
acceptance gaps remain separate.

## PR preparation against updated main

The plugin PR is based on `xpert-plugins/main` commit `4a2f1a6d`, including
standalone file/export Resource support merged after the first local validation.
The workflows retain its exact caption-draft/export Resource URIs, optional
Resource query handling and reliable-timestamp requirement for synchronized
captions. The Cut patch changeset is `cut-batch2-workflow-skills.md`.

All 38 plugin Jest suites / 178 tests passed on this integrated source.
The current local SDK installation lacks `ResourceReadContext`,
`WorkspaceFilesApi.scope` and the `user-xperts` catalog type required by the new
main code. Build/typecheck reports six diagnostics; an untouched archive of
`4a2f1a6d` reproduces the same six. This baseline dependency gap remains open;
the earlier successful build/prepack/lifecycle run above predates integration
with the updated main and does not prove the final PR builds with this SDK.
