---
'@xpert-ai/plugin-sdk': major
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Delegate scoped database workbench discovery and location handling to registered plugins. Preserve actor authorization, source revision checks and independent connection cleanup without a built-in engine allowlist.

Breaking SDK change: remove the legacy SQL adapter, dialect validation and quoting exports. Database plugins now own these implementations; SQL consumers migrate to the plugin-repository sql-workbench helpers. Strategies explicitly declare workbench support and runners accept the requested DatabaseLocation. Upgrade the MySQL/Doris, PostgreSQL, HANA and DB Studio plugins together with this SDK; old plugins without the registration opt-in are unavailable to the scoped workbench until upgraded.
