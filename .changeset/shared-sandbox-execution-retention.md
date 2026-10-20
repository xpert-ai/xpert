---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add an optional sandbox execution retention contract and bind it to the full Agent invocation lifecycle. Release retention on completion, errors and cancellation, and abort the graph when retention is lost. Allow Redis activity renewal only for an existing live owner.
