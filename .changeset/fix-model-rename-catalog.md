---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Do not expose unresolved saved model references as selectable provider models after rename or deletion. Preserve historical selections for explicit reselection, show an unavailable-model warning, and prevent saving an unavailable default model. Existing model-access revocation semantics are unchanged.
