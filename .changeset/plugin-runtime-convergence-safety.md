---
'@xpert-ai/contracts': patch
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Make plugin runtime convergence account for registered API replicas without a fixed registration window. Retain failed rollout outcomes, guard late replica catch-up, allow authorized retirement of offline instances, and synchronize organization plugin removals. Hide manual restart prompts from non-SuperAdmin users while retaining background progress.
