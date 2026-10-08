---
name: cloud-coding
description: Build, edit, test and preview code in the current Xpert cloud Computer using sandbox_shell and a managed coding CLI, including Qwen Code, Codex, OpenCode and Claude Code. Use for coding requests, especially when the user names a CLI. Use Computer screenshots only for visual verification or graphical apps.
---

# Cloud coding

Use the current cloud Computer's `sandbox_shell`, never the user's local Shell or
a GUI terminal. This skill works for Bosi and other Computer assistants. It does
not install software, grant access, select a different model or disable approvals.

## 1. Establish the task and workspace

Read the user's request and relevant project instructions. Check `pwd`, directory
contents and (for an existing repository) `git status --short`. Preserve existing
changes. Work inside the conversation's workspace; use a dedicated project folder
for a new site. Keep working directories explicit in every shell call. Do not use
the desktop HOME or host filesystem as an alternative workspace.

## 2. Discover the actual CLI

When the sandbox advertises `platform_models`, read its execution-local catalog:

```sh
cat "$XPERT_CODING_TOOLS_FILE"
```

The catalog comes from host registration and the current Agent model. A tool with
`modelCompatible: false` cannot use that model. `installation: verify_with_version`
is not proof it is installed: call its command with `--version` and compare with
the catalog. The wrapper enforces the approved executable version at launch.
Do not reinstall or silently update a missing/mismatched managed binary. Explain
the actual error; never label it a login problem without evidence.

Honor a named CLI. Otherwise prefer a compatible installed Qwen Code, OpenCode or
Codex. A list here is documentation, not an exhaustive allowed-ID list. For a new
registered tool, inspect its `--help` and supported headless/permission options.
If a requested tool is unavailable, explain why before offering an alternative.

Invoke `qwen`, `codex`, etc. by name through the supplied PATH. The host supplies
temporary model credentials and the current Agent's model. Do not use absolute
binary paths, `env -i`, `bash -l`, `sudo`, interactive login, copied keys, custom
API endpoints, model flags or a CLI's own model-selection wizard. Do not dump
environment/configuration files. On a sandbox without `platform_models`, never
claim automatic model access; check its actual supported authentication first.

## 3. Delegate a bounded coding task

Read the applicable reference in this directory:

- Qwen Code: `references/qwen.md`
- OpenCode and Codex: `references/opencode-codex.md`
- Claude Code, Kimi, CodeBuddy and Aider: `references/other-clis.md`

Give the CLI a concrete goal, allowed project directory, files to preserve and
acceptance checks. Use non-interactive output and `timeout_sec` (typically 180–600
seconds) appropriate to the work. Do not open its TUI, use a GUI terminal, or
background the coding process. Save structured output in a project-local task
log when large; inspect the final result and tool errors, not just process exit 0.

File edits requested by the user may use the CLI's edit-only approval mode. Do not
use `--yolo`, permission-bypass flags, blanket tool allowlists, disable application
sandboxes, or grant broader container privileges. For an operation the CLI cannot
approve headlessly, inspect what it requested. The parent Agent can run an already
authorized build/test command via `sandbox_shell`; an action requiring user
approval must go through the existing confirmation flow. Never change channels to
evade an explicit denial. Do not silently complete a failed named-CLI coding task
yourself and then claim the CLI did it.

## 4. Verify, recover and deliver

1. Inspect changed files and diffs. Verify the requested files exist; a successful
   model response is not proof they were written. Run relevant build/tests via
   `sandbox_shell`, preserving the same project directory.
2. On a timeout or interrupted execution, inspect files and logs first. Do not
   blindly repeat a mutating prompt. Managed CLI auth/config is per invocation;
   do not assume a CLI session ID can resume across shell calls. Send a bounded
   repair prompt with the observed state when recovery is needed.
3. Start a preview through `sandbox_service_start` with the correct project
   directory, port and readiness check. Use service status/logs to verify it.
   Do not use `&`, `nohup`, `disown`, or leave an unmanaged dev server running.
4. Use the returned preview URL. For visual acceptance, inspect it in the cloud
   browser and capture a fresh screenshot before GUI input. Screenshots are not
   required for catalog discovery, CLI invocation, compilation or file reads.
5. Call `present_files` with verified workspace-relative deliverables. Report what
   the CLI changed, what was tested and any remaining failures. Never invent a
   preview URL, artifact link or successful test.

Respect human takeover, cancellation, existing command approvals and network
restrictions throughout. Authentication rejection, unsupported model, missing CLI,
permission refusal, timeout and build failure are distinct outcomes; report the
one actually observed.
