---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-core': patch
---

Distinguish validated view host types and view keys in HTTP request metric routes so Grafana can rank individual views. Keep host IDs and query values out of metric labels, and preserve generic route templates for unresolved or unauthorized views.
