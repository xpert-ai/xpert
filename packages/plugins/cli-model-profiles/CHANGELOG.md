# @xpert-ai/cli-model-profiles

## 0.2.0

### Minor Changes

- bf33018: Expose optional version-pinned CLI background transports and V2 execution receipts that separate business cwd from managed execution records. Preserve V1 receipts and support bounded runtime reads.

### Patch Changes

- 1df94f0: Add version-qualified background CLI profiles for Claude Code 2.1.63, CodeBuddy
  2.161.1 and Kimi Code 2.1.1. Support an optional literal argv prompt argument in
  the SDK JSONL transport contract. Configure isolated settings and explicit
  permission modes; Kimi advertises only allow because its prompt mode forces
  automatic approval. Keep revisions unchanged for unrelated tools.

  Execution still requires a matching host transport and Agent Runtime adapter.

- bf33018: Make managed background Coding CLI permissions configurable through the existing
  tenant model execution policy, defaulting to allow with per-tool restricted
  overrides. Pin the selected mode in runner receipts and keep evidence-only review
  restrictions. Advertise supported modes in CLI profiles; leave interactive and
  managed shell sessions unchanged.
- b86bba1: Bundle shared model profiles for Codex, Claude Code, OpenCode, Aider, Qwen Code, Kimi and CodeBuddy, with a pinned toolchain and cloud-coding skill. Route shell-driven coding work through execution-scoped platform model access and enable coding tools with default policies.

  Load the optional local-shell sandbox plugin when explicitly configured and align its registration metadata with its package release. Keep sandbox service discovery passive and distinguish configuration errors from unavailable services.

- f5add6a: Remove the ModelExecution per-request input cap and the byte/token comparison from
  Chat, native and bridged CLI requests. Read and discard legacy maxInputTokens in
  persisted policies and grants. Reserve estimated request tokens plus output against
  cumulative budgets; settle using provider usage facts as before.

  Expose the selected model's catalog context window to CLI profiles instead of deriving
  it from tenant input limits. Custom CLI profiles must migrate from limits.maxInputTokens
  to optional model.contextWindow. Upgrade the host and profiles together and start a new
  execution to regenerate CLI configuration.

  Remove the extra output cap and fixed Qwen/CodeBuddy turn caps. Use optional catalog
  output metadata for CLI configuration, make execution token budgets explicit opt-ins,
  and distinguish rate/concurrency errors from budget exhaustion. Honor active response
  streams using an inactivity timer, and do not recover live grants as lost workers solely
  because their calls are old. Republished Assistant versions no longer invalidate an
  otherwise authorized execution.

- Updated dependencies [d18aa7f]
- Updated dependencies [b86bba1]
- Updated dependencies [a01cd48]
- Updated dependencies [1df94f0]
- Updated dependencies [bf33018]
- Updated dependencies [bf33018]
- Updated dependencies [aa33949]
- Updated dependencies [d4dba33]
- Updated dependencies [01fd502]
- Updated dependencies [deff039]
- Updated dependencies [b66bdcc]
- Updated dependencies [b86bba1]
- Updated dependencies [f5add6a]
- Updated dependencies [c941907]
- Updated dependencies [c0dd14c]
- Updated dependencies [00b626e]
- Updated dependencies [3142346]
- Updated dependencies [3185f56]
- Updated dependencies [98a7367]
- Updated dependencies [55ec356]
- Updated dependencies [00db21e]
- Updated dependencies [fffb0f4]
- Updated dependencies [d81dbe2]
- Updated dependencies [a131790]
  - @xpert-ai/contracts@3.20.0
  - @xpert-ai/plugin-sdk@3.20.0
