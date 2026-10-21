---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/contracts': patch
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/plugin-github-integration': patch
---

Centralize GitHub App settings in system integrations, including App slug and protected credential fields. Reuse the built-in integration read permission service for signed callbacks, with tenant-only integration selection and secret-preserving partial updates.

Add an optional integration.readConfiguration(id) capability bound to the plugin scope by the host. Validate tenant, organization and declared integration access inside the capability; system configuration resolves in the Default tenant without request context. Keep existing runtime read APIs compatible and keep PluginContext free of configuration storage details.

Return a client validation error for invalid plugin configuration without exposing rejected configuration values.

Add a validated, provider-independent workspace Connector command contract with optional authentication-method and system-integration constraints. Resolve capabilities from Connector declarations for both OAuth and API key methods, pin the host-owned dialog, and reject conflicting active or pending shared connections. Keep provider-specific policies and error guidance in plugins.

Keep narrowly scoped login and plugin recovery routes reachable through their existing authentication and authorization guards when plugin version drift makes the runtime unready. Continue fencing business traffic and all new requests during shutdown drain.

Move GitHub System Integration into the automatically loaded built-in plugin. Register its metadata and configuration handling through IntegrationStrategy, add a generic prepareConfig hook, and preserve existing integration IDs, provider keys, OAuth-only settings and saved secrets.
