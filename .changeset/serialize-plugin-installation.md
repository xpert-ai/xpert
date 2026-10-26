---
'@xpert-ai/server-common': patch
'@xpert-ai/server-config': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Run registry plugin installation asynchronously with bounded execution and process-group cleanup. Serialize shared-store mutations across API replicas, validate legacy installations, publish complete artifacts and manifests atomically, and propagate staging failures before runtime activation. Keep admission deadlines and restart capacity checks intact; verify slow installations overlapping rolling restarts through readiness-aware ingress.
