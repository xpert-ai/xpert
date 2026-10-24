---
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Preserve known Sandbox Runtime dependency error codes across the Analytics boundary with safe, localized remediation and retry policy. Keep arbitrary plugin HTTP errors, messages and execution details redacted.

Allow targeted Runtime family publication without npm publication or rebuilding already published families, and verify the full API manifest contract before image promotion.

Report invalid Action script inputs separately from Runtime startup failures, with fixed guidance about the Workspace script entrypoint and standard-library contract. Runner output remains private.
