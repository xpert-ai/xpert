---
'@xpert-ai/plugin-sdk': minor
---

Add opt-in multi-auth connector strategies, provider-neutral runtime credentials, and legacy credential mapping.

Integration-enabled plugins can also opt into inherited tenant and organization configuration reads for connector-owned OAuth apps.

Existing `ConnectorDefinition`, `ConnectorStrategy`, `ConnectorRuntimeCredential`, `ConnectorRuntimeApi.getConnector()`, and legacy registry accessors remain available unchanged. New providers can implement `ConnectorMultiAuthStrategy`, while runtime consumers can adopt `getConnectorCredential()` when the host exposes it.
