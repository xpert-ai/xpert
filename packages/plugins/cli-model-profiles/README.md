# CLI model profiles

Bundled, provider-independent configuration adapters for Codex, Claude Code, OpenCode, Aider, Qwen Code, Kimi and CodeBuddy.
The host owns identity, executable policy, authorization, secret materialization and metering.
Profiles declare transport/capabilities, qualified bridge versions, offline argv sequences and private configuration.
They receive `${XPERT_EXECUTION_TOKEN}`, never the actual credential.

A trusted integration can register `CliModelProfilesCapability` from `@xpert-ai/plugin-sdk` to supply a registry.
Delegate unknown built-in IDs to `builtinCliModelProfiles.get(id)` when extending the registry. An unregistered ID
never qualifies just because it appears in tenant policy. Increment a profile revision when changing its authorization
or configuration semantics; running Shell grants validate the original revision.

The host supplies the exact policy-pinned executable and checks the profile's accepted version output before preparing
credentials. The default ModelExecution policy enables version-qualified Chat translations; administrators can
override the allowed protocols. These translations are not native protocol support. Existing desktop CLI and managed
execution paths use the same bundled configuration functions.

`src/toolchain.json` contains the bundled tool IDs, exact versions, executable paths and installation metadata.
The exported `builtinCliTools` list supplies the default ModelExecution policy without tenant activation; it does not
install tools. Hosts can use the same manifest when building execution images. Optional policy overrides retain custom
tool paths, versions and limits. Changing a pin requires rebuilding the host image and verifying the real CLI and its adapter.

`skills/cloud-coding` is a standard skill shipped with this package. Hosts can install it in their skill directory to
guide coding work through `sandbox_shell`, then test and preview the result. It uses the runtime catalog and managed
PATH commands; it neither grants model access nor embeds credentials.
Managed shell Qwen uses edit-only `auto-edit` for headless file changes while retaining command approvals. Interactive
Qwen keeps its default approval mode. Background invocations use the explicit permission mode described below.

Optional `background` profiles describe version-qualified managed transports:
OpenCode uses its native loopback service; Codex, Qwen Code, CodeBuddy, Kimi Code
and Claude Code use single-prompt JSONL output. An optional `promptArgument`
provides one literal argv value for tools without stdin prompt support; it is
never interpolated into shell code. Other profiles keep stdin delivery.
The Runtime adapter still declares compatible `executionTools` and
owns protocol result parsing. The host intersects those declarations with policy
and never selects a CLI from its provider's display name.

Qwen, Codex, OpenCode, Claude and CodeBuddy profiles declare
`permissionModes: ['allow', 'restricted']`.
For background invocations the host passes `permissionMode` from the tenant's
`modelExecutionPolicy.cliPermissions` (default `allow`, optional tool-ID overrides).
Qwen maps `allow` to YOLO; `restricted` retains auto-edit plus Node shell approval.
Codex maps it to noninteractive full-access/workspace-write sandbox arguments.
OpenCode maps it to all enabled tools/the existing file-and-shell allowlist; the
interactive question tool remains disabled. Qwen safe mode and subagent exclusion
apply in both modes. Evidence-only review retains the host's stronger deny-all
override. These are CLI approval controls within an authorized Computer, not new
platform grants or mounted filesystem access.

`permissionMode` is optional for compatibility: interactive/managed shell launches
that omit it keep their prior behavior. Custom profiles must explicitly advertise
and implement each supported mode; the host rejects unsupported selections.

Background profiles additionally cover CodeBuddy **2.161.1**, Claude Code **2.1.63**
and Kimi Code **2.1.1**. Claude/CodeBuddy select `bypassPermissions` for `allow`, or
`dontAsk` with file tools and `Bash(node:*)` for `restricted`; ambient settings and
MCP servers are disabled. All three profiles restrict their tools to
Bash/Read/Write/Edit/Glob/Grep for this workflow.
Kimi uses a private agent file, empty skills directory and no subagents; its
prompt mode forces automatic approval, so it advertises **only `allow`**.
The host must reject `restricted` before launch instead of silently weakening it.
Interactive launches that omit `permissionMode` retain their original configuration.

These declarations require a matching host transport and Runtime adapter. Installing
the profile package alone does not provide Computer execution. Profile revisions are
declared per tool so changes to one adapter do not invalidate unrelated Shell grants.

### Model context hints

The host provides `defaultModelId` and optional per-model `contextWindow` from the provider
catalog. Built-in adapters use that window for CLI context management, independently of
execution budgets. Unknown windows are omitted where the CLI supports defaults. Kimi requires a catalog window
for custom aliases, so a missing window produces a configuration error instead of an invented cap.
`limits.maxInputTokens` has been removed. Custom profiles should read the selected model's
`contextWindow` instead. Output configuration uses the per-model catalog `outputTokenLimit`;
legacy `limits.maxOutputTokens` is accepted only for source compatibility and ignored by built-in profiles.
Unknown output maxima are omitted so CLI/provider defaults apply. Qwen and CodeBuddy background
profiles no longer add a fixed 30-turn cap.
Regenerate CLI configuration by starting a new execution after upgrading the host and profiles.
