---
'@xpert-ai/cli-model-profiles': patch
---

Update the bundled cloud-coding instructions to inherit the host's Codex permission
policy instead of forcing workspace-write. Document the Xpert Pro Computer default
of disabling Codex's inner sandbox inside its isolated container while preserving
explicit restricted policies. Advance the Codex profile revision to 6 to keep shared
profile metadata aligned with the managed launcher update.
