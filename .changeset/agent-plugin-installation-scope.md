---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/desktop': patch
---

Make tenant and organization Agent Plugin installations directly available in the ChatKit Plugins menu. Remove workspace publishing and addition from Cloud and Desktop, prepare selected runtime resources on demand, and retain existing conversation versions, expert mappings and Connector configuration.

Tenant packages inherit into organizations without sharing Connector credentials. Existing databases created with the original Agent Plugin SQL schema should apply `20261012-agent-plugin-installation-scope.sql` to allow tenant-scoped records.
