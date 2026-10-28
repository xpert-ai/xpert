---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Allow plugin-owned SAP HANA workbench adapters through the scoped data-source runtime. Preserve the saved tenant database, map requested schemas to the HANA connection, and retain per-call authorization and source-revision checks. The legacy SDK SQL adapter remains limited to MySQL, Doris and PostgreSQL.
