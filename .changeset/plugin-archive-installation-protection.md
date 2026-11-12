---
'@xpert-ai/contracts': minor
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Track host-verified archive provenance separately from client source configuration. Serialize duplicate/replacement decisions under the plugin store lease, reuse matching immutable installations without reloading, and repair missing package directories from the same approved archive. Keep configuration edits separate and return installation targets without claiming runtime convergence.
