---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
---

Add persisted conversation Resource Cards, the public emitResourceCard helper and optional transactional Project creation receipts. Cards use typed Workbench navigation without changing file Artifacts. Scheduler creation now emits a receipt and offers an on-demand, authorized detail/edit/history View. ChatKit and Xpert SDK companion releases are required for the UI; publish public contracts/SDK before consuming plugins.

Opening an Assistant Project target with a View now opens a separately scoped host tab, retaining the current conversation, composer and ChatKit mount. The target Project is authorized independently, and its View scope survives refresh and browser history. Explicit Project selection without a View retains its existing workspace-switch behavior.
