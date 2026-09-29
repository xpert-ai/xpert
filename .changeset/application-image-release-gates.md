---
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/nsjail-runner': patch
---

Publish application Docker images only for their own Changesets. Build scoped candidates, require consumed Changesets for stable releases, and check that shared package releases include their consuming applications.
