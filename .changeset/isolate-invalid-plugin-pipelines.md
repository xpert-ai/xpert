---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Keep API startup available when an external plugin pipeline contribution fails contract validation, including legacy templates that omit projectTypes. Isolate constructor and discovery validation failures, exclude invalid contributions from the catalog, and report scoped diagnostics without payload values. Preserve strict explicit registration, built-in validation, dependency injection and non-validation errors.
