---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-ui': patch
---

Add editable prompt workflow scenarios, organization tags, expert associations, and expert-scoped capability selections. Refresh prompt management and command availability, preserve explicit field clearing, and send expanded editable prompts without expanding them again on the server.

Requires the ChatKit types and UI release that introduces prompt scenarios and editable prompt drafts; update the host's ChatKit dependencies to that published release before shipping.
