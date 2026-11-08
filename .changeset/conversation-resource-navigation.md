---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-api': patch
---

Add metadata-only resource search and Workbench navigation tools, with accepted group references, requester-scoped live events, inert fallback entries and replay protection. Preserve source editing and data-query authorization boundaries.

Keep group observer streams alive during execution by comparing persisted varchar thread IDs against UUID runtime bindings as text.

Expose navigation through the optional Resource Assistant middleware. Respect configured nodes, runtime capability selections and per-tool preferences in both Project and group conversations; group adapters retain the exact admitted delivery and never fall back to Project-wide discovery.

Offer Resource Assistant in Assistant creation and capability configuration, including quick creation. Enabling it composes the navigation middleware through the existing capability lifecycle, requires a tool-calling model, and preserves managed removal and manually configured nodes.
