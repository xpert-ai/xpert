---
'@xpert-ai/contracts': patch
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-ui': patch
---

Add plugin installation as the final system setup step, with a paginated marketplace catalog, plugin details, filters, grouping, and selection across pages using Zard UI. Install selected plugins sequentially, skip failures, optionally import the official Agent plugins, and defer runtime activation until the batch finishes. Persist installation progress, resume interrupted work, and enter the organization only after runtime convergence completes.
