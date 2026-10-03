# CLI model profiles

Bundled, provider-independent configuration adapters for Codex, Claude Code, OpenCode and Aider.
The host owns identity, executable policy, authorization, secret materialization and metering.
Profiles declare transport/capabilities, qualified bridge versions, offline argv sequences and private configuration.
They receive `${XPERT_EXECUTION_TOKEN}`, never the actual credential.

A trusted integration can register `CliModelProfilesCapability` from `@xpert-ai/plugin-sdk` to supply a registry.
Delegate unknown built-in IDs to `builtinCliModelProfiles.get(id)` when extending the registry. An unregistered ID
never qualifies just because it appears in tenant policy. Increment a profile revision when changing its authorization
or configuration semantics; running Shell grants validate the original revision.

The host supplies the exact policy-pinned executable and checks the profile's accepted version output before preparing
credentials. Chat translations are explicitly enabled by tenant policy and qualified by CLI version; they are not native
protocol support. Existing desktop CLI and managed execution paths use the same bundled configuration functions.
