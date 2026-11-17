---
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add explicit catalog refresh, indexed cursor reads and suppression-only path coverage for Spaces. Preserve live source authorization while bounding candidate reads and remove repeated Project checks within one page request. Validate persisted path metadata before using it to suppress duplicate files.
