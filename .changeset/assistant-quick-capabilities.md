---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Let Assistant capability providers explicitly opt into parameter-free creation switches through supportsQuickCreation. Cloud discovers these options from the server instead of hardcoding Project management, so Spaces and future plugins can participate without bespoke UI. Preserve model authorization, existing capabilities and revision-checked composition; apply and save all selected capabilities before publication.
