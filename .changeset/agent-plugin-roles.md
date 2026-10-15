---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add the optional package-level Agent Plugin role: capability, assistant, or subagent. Hide only assistant-role packages from ChatKit discovery while keeping all valid templates in the Assistant marketplace.

Support selection-purpose catalog reads so existing conversations retain resource metadata and pinned references. Role changes do not revoke execution access or alter template dependencies. Deploy this API before the matching ChatKit update and import role-bearing packages only after upgrading the parser.
