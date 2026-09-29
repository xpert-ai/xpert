---
'@xpert-ai/desktop': patch
---

Support trusted private deployments with an opt-in connection setting for untrusted service certificates. Apply the setting only to configured API, Web and ChatKit hosts, including Desktop Shell connections, and reset connections when the policy changes.

Check service certificates independently of this setting and show non-blocking warnings with specific certificate or network errors. Keep certificate warnings visible when connections are allowed, while preserving normal certificate validation by default.
