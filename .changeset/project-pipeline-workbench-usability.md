---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Allow signed-in Assistant sessions to start Project pipelines with live Project, Assistant and Connector permission checks, without development-only environment or Project allowlists. Preserve durable delegation requirements for resource credentials and log safe diagnostics when pipeline observation is deferred.

Resolve saved pipeline subjects to their authorized business Workbench view through an optional subject adapter entry, so opening the business workspace stays inside Bosi and selects the associated review.

Make pipeline cards and headers more compact, add persistent zoom and fit-to-view controls, and combine zoom with the status bar. Separate sequential steps and logical nodes into dependency-ordered columns with dedicated control headers and dividers, and place lane execution indicators at the bottom right.
