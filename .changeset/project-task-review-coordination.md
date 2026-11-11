---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Coordinate independent evidence-review tasks with pinned implementation candidates, reusable review attempts, assigned reviewers, and explicit summary acceptance or rework. Preserve parent and child decision histories atomically and fence stale runtime observations without coupling shared task services to the Pro Computer verifier.

Centralize review executor admission at the existing Runtime factory boundary and leave summary state under explicit coordination instead of copying individual child runtime states.
