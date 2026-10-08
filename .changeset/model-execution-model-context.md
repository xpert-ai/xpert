---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/cli-model-profiles': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Remove the ModelExecution per-request input cap and the byte/token comparison from
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
