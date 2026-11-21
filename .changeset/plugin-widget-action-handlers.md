---
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add the turn-scoped `ConversationRuntimeCapability` with `publishWidget()`. Allow plugins to publish and restore A2UI Widgets and register one scoped Widget action provider per Widget type with an explicit set of handlers from their own Nest modules. The host resolves durable references for live messages and history, dispatches authorized actions through a shared ChatKit endpoint and removes providers and handlers when their installation is unloaded. Plugin-owned strategy decorators can declare a registration category and name for ownership and conflict checks before module initialization.

Expose `NamedProviderRegistry` as an opt-in shared registry for validated, owner-qualified providers with strict conflicts. Consolidate discovery, scoped name lookup and subscription cleanup in `BaseStrategyRegistry` while preserving ordinary registry naming and replacement behavior.
