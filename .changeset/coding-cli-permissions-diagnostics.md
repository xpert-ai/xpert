---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/cli-model-profiles': minor
'@xpert-ai/server-ai': patch
---

Make managed background Coding CLI permissions configurable through the existing
tenant model execution policy, defaulting to allow with per-tool restricted
overrides. Pin the selected mode in runner receipts and keep evidence-only review
restrictions. Advertise supported modes in CLI profiles; leave interactive and
managed shell sessions unchanged.
