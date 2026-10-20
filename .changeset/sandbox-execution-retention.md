---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add an optional sandbox execution-retention contract and a Redis activity-renewal primitive that only extends live owners, without recreating expired or released owners. Sandbox providers can use these shared capabilities to protect active executions; the Docker provider implementation is delivered separately in Pro.
